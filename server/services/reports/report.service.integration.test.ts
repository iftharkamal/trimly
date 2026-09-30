// Reports against PostgreSQL, with data placed around the shop's (Asia/Kolkata,
// UTC+5:30) day, week and month boundaries.
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../db'
import { customers, payments, queueEntries } from '../../db/schema'
import { createShopFixture, resetDatabase, type ShopFixture } from '../../testing/fixtures'
import { getReport } from './report.service'

// 17:30 on Wednesday 30 September in India.
const NOW = new Date('2026-09-30T12:00:00.000Z')

let shop: ShopFixture

beforeEach(async () => {
  await resetDatabase()
  shop = await createShopFixture({ bufferMinutes: 5 })
})

async function customer(name: string): Promise<string> {
  const [row] = await useDb().insert(customers).values({ name }).returning({ id: customers.id })
  return row!.id
}

/** A service completed at `endedAt`, paid then (or not paid at all). */
async function completed(customerId: string, endedAt: string, paidMinor: number | null) {
  const at = new Date(endedAt)
  const [entry] = await useDb().insert(queueEntries).values({
    shopId: shop.shopId,
    barberId: shop.barberId,
    customerId,
    serviceId: shop.services.haircut,
    source: 'WALK_IN',
    status: 'COMPLETED',
    serviceName: 'Haircut',
    durationMinutes: 20,
    priceMinor: 15000,
    joinedAt: new Date(at.getTime() - 30 * 60_000),
    startedAt: new Date(at.getTime() - 20 * 60_000),
    endedAt: at
  }).returning({ id: queueEntries.id })

  if (paidMinor !== null) {
    await useDb().insert(payments).values({
      queueEntryId: entry!.id,
      amountMinor: paidMinor,
      method: 'CASH',
      status: 'PAID',
      paidAt: at
    })
  }
}

async function seedHistory() {
  const regular = await customer('Regular')
  // Today (30 Sep, local).
  await completed(regular, '2026-09-30T04:30:00Z', 15000) // 10:00
  await completed(regular, '2026-09-30T05:45:00Z', 10000) // 11:15 — same customer again
  await completed(await customer('Unpaid'), '2026-09-30T06:00:00Z', null) // 11:30, no payment
  await completed(await customer('Early'), '2026-09-29T18:40:00Z', 22000) // 00:10 local: still today
  // Yesterday (29 Sep, local), 23:50.
  await completed(await customer('Late'), '2026-09-29T18:20:00Z', 10000)
  // Earlier this month, a previous week.
  await completed(await customer('Earlier'), '2026-09-20T06:00:00Z', 15000)
  // Last month.
  await completed(await customer('August'), '2026-08-15T06:00:00Z', 20000)
}

describe('getReport', () => {
  it('daily: totals in shop time, compared with yesterday', async () => {
    await seedHistory()

    const report = await getReport(shop.shopId, 'day', undefined, NOW)

    expect(report).toMatchObject({
      period: 'day',
      start: '2026-09-30',
      end: '2026-10-01',
      previousDate: '2026-09-29',
      nextDate: null,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      // 150 + 100 + 220 received; 4 services for 3 different customers.
      totals: { revenueMinor: 47000, services: 4, customers: 3, payments: 3, averageBillMinor: 15667 },
      previousTotals: { revenueMinor: 10000, services: 1, customers: 1, payments: 1, averageBillMinor: 10000 },
      changes: { revenue: 370, services: 300, customers: 200, averageBill: 57 }
    })
  })

  it('daily: revenue per local hour', async () => {
    await seedHistory()

    const { trend } = await getReport(shop.shopId, 'day', undefined, NOW)

    expect(trend.unit).toBe('hour')
    expect(trend.buckets).toHaveLength(24)
    expect(trend.buckets.filter(bucket => bucket.revenueMinor > 0)).toEqual([
      { key: '00', revenueMinor: 22000 },
      { key: '10', revenueMinor: 15000 },
      { key: '11', revenueMinor: 10000 }
    ])
  })

  it('weekly: Monday to Sunday, revenue per day', async () => {
    await seedHistory()

    const report = await getReport(shop.shopId, 'week', undefined, NOW)

    expect(report).toMatchObject({
      start: '2026-09-28',
      end: '2026-10-05',
      previous: { start: '2026-09-21', end: '2026-09-28' },
      totals: { revenueMinor: 57000, services: 5, customers: 4, payments: 4, averageBillMinor: 14250 },
      // Nothing happened the previous week, so there's nothing to compare with.
      changes: { revenue: null, services: null, customers: null, averageBill: null }
    })
    expect(report.trend.unit).toBe('day')
    expect(report.trend.buckets.map(bucket => bucket.key)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ])
    expect(report.trend.buckets.filter(bucket => bucket.revenueMinor > 0)).toEqual([
      { key: '2026-09-29', revenueMinor: 10000 },
      { key: '2026-09-30', revenueMinor: 47000 }
    ])
  })

  it('monthly: the whole month, compared with the previous month', async () => {
    await seedHistory()

    const report = await getReport(shop.shopId, 'month', undefined, NOW)

    expect(report).toMatchObject({
      start: '2026-09-01',
      end: '2026-10-01',
      previousDate: '2026-08-01',
      totals: { revenueMinor: 72000, services: 6, customers: 5, payments: 5, averageBillMinor: 14400 },
      previousTotals: { revenueMinor: 20000, services: 1, customers: 1 },
      changes: { revenue: 260 }
    })
    expect(report.trend.buckets).toHaveLength(30)
  })

  it('browses to an earlier period and links forward', async () => {
    await seedHistory()

    const yesterday = await getReport(shop.shopId, 'day', '2026-09-29', NOW)
    expect(yesterday).toMatchObject({
      start: '2026-09-29',
      nextDate: '2026-09-30',
      totals: { revenueMinor: 10000, services: 1 }
    })

    const august = await getReport(shop.shopId, 'month', '2026-08-31', NOW)
    expect(august).toMatchObject({ start: '2026-08-01', nextDate: '2026-09-01', totals: { revenueMinor: 20000 } })
  })

  it('treats a future date as today', async () => {
    const report = await getReport(shop.shopId, 'day', '2027-01-01', NOW)
    expect(report).toMatchObject({ start: '2026-09-30', nextDate: null })
  })

  it('reports an empty period as zeros with no average', async () => {
    const report = await getReport(shop.shopId, 'week', undefined, NOW)

    expect(report.totals).toEqual({ revenueMinor: 0, services: 0, customers: 0, payments: 0, averageBillMinor: null })
    expect(report.trend.buckets.every(bucket => bucket.revenueMinor === 0)).toBe(true)
  })

  it('only counts this shop', async () => {
    await seedHistory()
    const other = await createShopFixture({ slug: 'other-shop' })

    const report = await getReport(other.shopId, 'month', undefined, NOW)

    expect(report.totals).toMatchObject({ revenueMinor: 0, services: 0, customers: 0 })
  })
})
