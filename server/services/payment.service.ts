// Payments for completed services. No online processing: the barber records
// how the customer paid (cash, UPI, card) at the counter.
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { PaymentInput } from '../../shared/schemas/payment'
import { useDb, type Transaction } from '../db'
import { payments, queueEntries, shops } from '../db/schema'
import { localDayRange, type TimeRange } from './day-range'
import { DomainError } from './errors'

/** Records a payment as received now. Runs inside the caller's transaction. */
export async function recordPayment(tx: Transaction, queueEntryId: string, payment: PaymentInput): Promise<void> {
  await tx.insert(payments).values({
    queueEntryId,
    amountMinor: payment.amountMinor,
    method: payment.method,
    status: 'PAID',
    paidAt: sql`now()`
  })
}

function paidInRange(shopId: string, range: TimeRange) {
  return and(
    eq(queueEntries.shopId, shopId),
    eq(payments.status, 'PAID'),
    gte(payments.paidAt, range.start),
    lt(payments.paidAt, range.end)
  )
}

/** Money received in a time range: the total and how many payments it came from. */
export async function getRevenueSummary(shopId: string, range: TimeRange): Promise<{ revenueMinor: number, payments: number }> {
  const [row] = await useDb()
    .select({
      revenueMinor: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`.mapWith(Number),
      payments: sql<number>`count(*)`.mapWith(Number)
    })
    .from(payments)
    .innerJoin(queueEntries, eq(queueEntries.id, payments.queueEntryId))
    .where(paidInRange(shopId, range))

  return row ?? { revenueMinor: 0, payments: 0 }
}

/**
 * Money received per local hour ("00"–"23") or local date ("YYYY-MM-DD") in
 * `timezone`. Buckets with no payments are absent.
 */
export async function getRevenueByBucket(
  shopId: string,
  range: TimeRange,
  timezone: string,
  unit: 'hour' | 'day'
): Promise<Map<string, number>> {
  const localPaidAt = sql`(${payments.paidAt} at time zone ${timezone})`
  const bucket = unit === 'hour'
    ? sql<string>`to_char(${localPaidAt}, 'HH24')`
    : sql<string>`to_char(${localPaidAt}, 'YYYY-MM-DD')`

  const rows = await useDb()
    .select({
      bucket,
      revenueMinor: sql<number>`sum(${payments.amountMinor})`.mapWith(Number)
    })
    .from(payments)
    .innerJoin(queueEntries, eq(queueEntries.id, payments.queueEntryId))
    .where(paidInRange(shopId, range))
    // By position: the bucket expression's parameters would otherwise make
    // Postgres treat the SELECT and GROUP BY expressions as different.
    .groupBy(sql`1`)

  return new Map(rows.map(row => [row.bucket, row.revenueMinor]))
}

/** Money received today (shop timezone), in minor units. */
export async function getTodayRevenue(shopId: string, now = new Date()): Promise<number> {
  const shop = await useDb().query.shops.findFirst({ where: eq(shops.id, shopId), columns: { timezone: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }

  return (await getRevenueSummary(shopId, localDayRange(shop.timezone, now))).revenueMinor
}
