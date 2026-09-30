// Payments for completed services. No online processing: the barber records
// how the customer paid (cash, UPI, card) at the counter.
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { PaymentInput } from '../../shared/schemas/payment'
import { useDb, type Transaction } from '../db'
import { payments, queueEntries, shops } from '../db/schema'
import { localDayRange } from './day-range'
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

/** Money received today (shop timezone), in minor units. */
export async function getTodayRevenue(shopId: string, now = new Date()): Promise<number> {
  const db = useDb()

  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId), columns: { timezone: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }

  const today = localDayRange(shop.timezone, now)
  const [row] = await db
    .select({ revenueMinor: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`.mapWith(Number) })
    .from(payments)
    .innerJoin(queueEntries, eq(queueEntries.id, payments.queueEntryId))
    .where(and(
      eq(queueEntries.shopId, shopId),
      eq(payments.status, 'PAID'),
      gte(payments.paidAt, today.start),
      lt(payments.paidAt, today.end)
    ))

  return row?.revenueMinor ?? 0
}
