// Queue service against a real PostgreSQL database (TEST_DATABASE_URL).
// Covers what the pure tests can't: database constraints, concurrency,
// and ETAs computed from the timestamps the database actually recorded.
import { and, eq, inArray, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../db'
import { customers, payments, queueEntries } from '../../db/schema'
import { createShopFixture, resetDatabase, type ShopFixture } from '../../testing/fixtures'
import { DomainError, type DomainErrorCode } from '../errors'
import { getTodayRevenue } from '../payment.service'
import {
  addCustomer,
  cancelEntry,
  completeService,
  getActiveQueue,
  getTodayStats,
  markNoShow,
  startService,
  type ShopQueue
} from './queue.service'

const MINUTE_MS = 60_000

let shop: ShopFixture

beforeEach(async () => {
  await resetDatabase()
  shop = await createShopFixture({ bufferMinutes: 5 })
})

async function join(name: string, serviceId: string) {
  const { entry } = await addCustomer({
    shopId: shop.shopId,
    customer: { name, phone: null },
    serviceId,
    barberId: shop.barberId,
    source: 'WALK_IN'
  })
  return entry
}

async function readEntry(id: string) {
  const entry = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, id) })
  if (!entry) {
    throw new Error(`Entry ${id} not found`)
  }
  return entry
}

function laneOf(queue: ShopQueue) {
  const lane = queue.barbers.find(item => item.barber.id === shop.barberId)
  if (!lane) {
    throw new Error('Barber lane missing')
  }
  return lane.state
}

function waitingIn(queue: ShopQueue, entryId: string) {
  const item = laneOf(queue).waiting.find(waiting => waiting.entry.id === entryId)
  if (!item) {
    throw new Error(`Entry ${entryId} is not waiting`)
  }
  return item
}

function plusMinutes(date: Date | null, minutes: number): number {
  if (!date) {
    throw new Error('Expected a timestamp')
  }
  return date.getTime() + minutes * MINUTE_MS
}

async function expectDomainError(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(DomainError)
  expect((error as DomainError).code).toBe(code)
}

async function countInProgress(): Promise<number> {
  const rows = await useDb()
    .select({ id: queueEntries.id })
    .from(queueEntries)
    .where(and(eq(queueEntries.barberId, shop.barberId), eq(queueEntries.status, 'IN_PROGRESS')))
  return rows.length
}

describe('queue service (PostgreSQL)', () => {
  it('1. empty queue: the barber is free now', async () => {
    const now = new Date()
    const state = laneOf(await getActiveQueue(shop.shopId, now))

    expect(state.current).toBeNull()
    expect(state.waiting).toEqual([])
    expect(state.nextAvailableAt).toEqual(now)
  })

  it('2. one customer waiting: first in line and starts now', async () => {
    const entry = await join('A', shop.services.haircut)

    expect(entry).toMatchObject({ status: 'WAITING', position: 1, customersAhead: 0, waitMinutes: 0 })
    expect(entry.estimatedStart).toEqual(entry.calculatedAt)
  })

  it('5. customer joins while another is in progress: ETA follows the current service plus buffer', async () => {
    const a = await join('A', shop.services.haircut)
    await startService(shop.shopId, a.id)
    const { startedAt } = await readEntry(a.id)

    const b = await join('B', shop.services.beard)

    expect(b).toMatchObject({ position: 1, customersAhead: 1 })
    expect(b.estimatedStart?.getTime()).toBe(plusMinutes(startedAt, 20 + shop.bufferMinutes))
    expect(b.estimatedEnd?.getTime()).toBe(plusMinutes(startedAt, 20 + shop.bufferMinutes + 10))
  })

  describe('6 & 16. current customer completes', () => {
    it('frees the barber and recalculates the next ETA from the actual end time', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)

      const whileInProgress = await startService(shop.shopId, a.id)
      const { startedAt } = await readEntry(a.id)
      expect(waitingIn(whileInProgress, b.id).estimatedStart.getTime())
        .toBe(plusMinutes(startedAt, 20 + shop.bufferMinutes))

      // Completed right away, i.e. about 20 minutes early.
      const afterCompletion = await completeService(shop.shopId, a.id)
      const completed = await readEntry(a.id)

      expect(completed.status).toBe('COMPLETED')
      expect(laneOf(afterCompletion).current).toBeNull()
      expect(waitingIn(afterCompletion, b.id)).toMatchObject({ position: 1, customersAhead: 0 })
      expect(waitingIn(afterCompletion, b.id).estimatedStart.getTime())
        .toBe(plusMinutes(completed.endedAt, shop.bufferMinutes))
      // Not started automatically: the barber starts the next customer.
      expect((await readEntry(b.id)).status).toBe('WAITING')
    })

    it('uses the actual end time when the service ran over', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)
      await startService(shop.shopId, a.id)
      // Simulate a haircut that started 30 minutes ago (planned 20).
      await useDb()
        .update(queueEntries)
        .set({ startedAt: sql`now() - interval '30 minutes'` })
        .where(eq(queueEntries.id, a.id))

      const overrunning = await getActiveQueue(shop.shopId)
      expect(laneOf(overrunning).current?.isOverrunning).toBe(true)
      expect(waitingIn(overrunning, b.id).estimatedStart.getTime())
        .toBe(plusMinutes(overrunning.calculatedAt, shop.bufferMinutes))

      const afterCompletion = await completeService(shop.shopId, a.id)
      const { endedAt } = await readEntry(a.id)
      expect(waitingIn(afterCompletion, b.id).estimatedStart.getTime())
        .toBe(plusMinutes(endedAt, shop.bufferMinutes))
    })

    it('cannot complete a customer who has not started, or complete twice', async () => {
      const a = await join('A', shop.services.haircut)

      await expectDomainError(completeService(shop.shopId, a.id), 'INVALID_TRANSITION')
      await startService(shop.shopId, a.id)
      await completeService(shop.shopId, a.id)
      await expectDomainError(completeService(shop.shopId, a.id), 'INVALID_TRANSITION')
    })
  })

  it('7. customer cancels: removed from the queue, everyone behind moves up', async () => {
    const a = await join('A', shop.services.haircut)
    const b = await join('B', shop.services.beard)
    const c = await join('C', shop.services.haircutAndBeard)
    expect(c.position).toBe(3)

    const queue = await cancelEntry(shop.shopId, b.id)

    expect(laneOf(queue).waiting.map(item => item.entry.id)).toEqual([a.id, c.id])
    expect(waitingIn(queue, c.id)).toMatchObject({ position: 2, customersAhead: 1 })
    // Only A's haircut and one buffer remain ahead of C.
    expect(waitingIn(queue, c.id).estimatedStart.getTime())
      .toBe(plusMinutes(queue.calculatedAt, 20 + shop.bufferMinutes))
    expect(await readEntry(b.id)).toMatchObject({ status: 'CANCELLED', startedAt: null })
    expect((await readEntry(b.id)).endedAt).toBeInstanceOf(Date)
  })

  it('8. customer is marked no-show: the next customer can start now, with no buffer', async () => {
    const a = await join('A', shop.services.haircut)
    const b = await join('B', shop.services.beard)

    const queue = await markNoShow(shop.shopId, a.id)

    expect(waitingIn(queue, b.id)).toMatchObject({ position: 1, customersAhead: 0 })
    expect(waitingIn(queue, b.id).estimatedStart).toEqual(queue.calculatedAt)
    expect((await readEntry(a.id)).status).toBe('NO_SHOW')
  })

  describe('14. two customers can never be IN_PROGRESS for the same barber', () => {
    it('rejects starting a second customer while one is in the chair', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)
      await startService(shop.shopId, a.id)

      await expectDomainError(startService(shop.shopId, b.id), 'BARBER_BUSY')

      expect(await countInProgress()).toBe(1)
      expect((await readEntry(b.id)).status).toBe('WAITING')
    })

    it('lets exactly one of two simultaneous starts win', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)

      const results = await Promise.allSettled([startService(shop.shopId, a.id), startService(shop.shopId, b.id)])

      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find(result => result.status === 'rejected')
      expect(rejected?.reason).toBeInstanceOf(DomainError)
      expect((rejected?.reason as DomainError).code).toBe('BARBER_BUSY')
      expect(await countInProgress()).toBe(1)
    })

    it('is enforced by the database even if the service is bypassed', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)

      await expect(
        useDb()
          .update(queueEntries)
          .set({ status: 'IN_PROGRESS', startedAt: sql`now()` })
          .where(inArray(queueEntries.id, [a.id, b.id]))
      ).rejects.toThrow()

      expect(await countInProgress()).toBe(0)
    })

    it('allows the next customer to start once the current one completes', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)
      await startService(shop.shopId, a.id)
      await completeService(shop.shopId, a.id)

      const queue = await startService(shop.shopId, b.id)

      expect(laneOf(queue).current?.entry.id).toBe(b.id)
      expect(await countInProgress()).toBe(1)
    })
  })

  describe('15. queue position is derived, not stored', () => {
    it('has no stored position or ETA column', async () => {
      const result = await useDb().execute<{ column_name: string, data_type: string }>(sql`
        select column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'queue_entries'
      `)
      const columns = new Map(result.rows.map(row => [row.column_name, row.data_type]))

      expect(columns.has('joined_at')).toBe(true)
      expect([...columns.keys()].filter(name => /position|rank|eta|estimate|wait/.test(name))).toEqual([])
      // order_at is the sort key: a time (joined, or booked for appointments), not a position.
      expect(columns.get('order_at')).toBe('timestamp with time zone')
    })

    it('changes positions without writing to the other entries', async () => {
      const a = await join('A', shop.services.haircut)
      const b = await join('B', shop.services.beard)
      const c = await join('C', shop.services.haircutAndBeard)
      const before = await Promise.all([readEntry(b.id), readEntry(c.id)])

      const queue = await cancelEntry(shop.shopId, a.id)
      const after = await Promise.all([readEntry(b.id), readEntry(c.id)])

      expect(waitingIn(queue, b.id).position).toBe(1)
      expect(waitingIn(queue, c.id).position).toBe(2)
      // B and C moved up without their rows being touched.
      expect(after).toEqual(before)
    })
  })
})

describe('getTodayStats', () => {
  // 01:30 on 1 October in the shop's timezone (Asia/Kolkata, UTC+5:30),
  // while it is still 30 September in UTC. Local midnight = 2026-09-30T18:30Z.
  const now = new Date('2026-09-30T20:00:00.000Z')
  const beforeMidnight = new Date('2026-09-30T18:00:00.000Z')
  const afterMidnight = new Date('2026-09-30T19:00:00.000Z')

  async function insertEntry(
    status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
    joinedAt: Date,
    endedAt: Date | null,
    priceMinor: number
  ): Promise<string> {
    const [customer] = await useDb().insert(customers).values({ name: 'Stats' }).returning({ id: customers.id })
    const [entry] = await useDb().insert(queueEntries).values({
      shopId: shop.shopId,
      barberId: shop.barberId,
      customerId: customer!.id,
      serviceId: shop.services.haircut,
      source: 'WALK_IN',
      status,
      serviceName: 'Haircut',
      durationMinutes: 20,
      priceMinor,
      joinedAt,
      startedAt: status === 'COMPLETED' || status === 'IN_PROGRESS' ? joinedAt : null,
      endedAt
    }).returning({ id: queueEntries.id })
    return entry!.id
  }

  it('counts only today in the shop’s timezone', async () => {
    // Yesterday (local): ignored entirely.
    await insertEntry('COMPLETED', beforeMidnight, beforeMidnight, 15000)
    // Joined yesterday but completed today: a service completed today, not a customer today.
    await insertEntry('COMPLETED', beforeMidnight, afterMidnight, 22000)
    // Today.
    await insertEntry('COMPLETED', afterMidnight, afterMidnight, 10000)
    await insertEntry('IN_PROGRESS', afterMidnight, null, 15000)
    await insertEntry('WAITING', afterMidnight, null, 15000)
    await insertEntry('CANCELLED', afterMidnight, afterMidnight, 15000)
    await insertEntry('NO_SHOW', afterMidnight, afterMidnight, 15000)

    expect(await getTodayStats(shop.shopId, now)).toEqual({ customers: 3, servicesCompleted: 2 })
  })

  it('returns zeros for a quiet day', async () => {
    expect(await getTodayStats(shop.shopId, now)).toEqual({ customers: 0, servicesCompleted: 0 })
  })

  it('rejects an unknown shop', async () => {
    await expectDomainError(getTodayStats('00000000-0000-4000-8000-000000000000', now), 'SHOP_NOT_FOUND')
  })

  describe('getTodayRevenue', () => {
    async function insertPayment(
      entryId: string,
      amountMinor: number,
      status: 'PAID' | 'PENDING' | 'REFUNDED',
      paidAt: Date | null
    ) {
      await useDb().insert(payments).values({
        queueEntryId: entryId,
        amountMinor,
        status,
        method: status === 'PENDING' ? null : 'CASH',
        paidAt,
        refundedAt: status === 'REFUNDED' ? afterMidnight : null
      })
    }

    it('sums payments received today in the shop’s timezone', async () => {
      // Paid yesterday (local): not today's revenue.
      await insertPayment(await insertEntry('COMPLETED', beforeMidnight, beforeMidnight, 15000), 15000, 'PAID', beforeMidnight)
      // Paid today, including a discounted amount.
      await insertPayment(await insertEntry('COMPLETED', afterMidnight, afterMidnight, 15000), 15000, 'PAID', afterMidnight)
      await insertPayment(await insertEntry('COMPLETED', afterMidnight, afterMidnight, 22000), 20000, 'PAID', afterMidnight)
      // Not money received.
      await insertPayment(await insertEntry('COMPLETED', afterMidnight, afterMidnight, 10000), 10000, 'PENDING', null)
      await insertPayment(await insertEntry('COMPLETED', afterMidnight, afterMidnight, 10000), 10000, 'REFUNDED', afterMidnight)
      // Completed without payment.
      await insertEntry('COMPLETED', afterMidnight, afterMidnight, 15000)

      expect(await getTodayRevenue(shop.shopId, now)).toBe(35000)
    })

    it('only counts this shop', async () => {
      const other = await createShopFixture({ slug: 'other-shop' })
      const [customer] = await useDb().insert(customers).values({ name: 'Other' }).returning({ id: customers.id })
      const [entry] = await useDb().insert(queueEntries).values({
        shopId: other.shopId,
        barberId: other.barberId,
        customerId: customer!.id,
        serviceId: other.services.haircut,
        source: 'WALK_IN',
        status: 'COMPLETED',
        serviceName: 'Haircut',
        durationMinutes: 20,
        priceMinor: 15000,
        joinedAt: afterMidnight,
        startedAt: afterMidnight,
        endedAt: afterMidnight
      }).returning({ id: queueEntries.id })
      await insertPayment(entry!.id, 15000, 'PAID', afterMidnight)

      expect(await getTodayRevenue(shop.shopId, now)).toBe(0)
      expect(await getTodayRevenue(other.shopId, now)).toBe(15000)
    })
  })
})

describe('completeService with payment', () => {
  async function inChair(name: string) {
    const entry = await join(name, shop.services.haircut)
    await startService(shop.shopId, entry.id)
    return entry.id
  }

  async function paymentFor(entryId: string) {
    return useDb().query.payments.findFirst({ where: eq(payments.queueEntryId, entryId) })
  }

  it('completes and records the payment together', async () => {
    const entryId = await inChair('A')

    await completeService(shop.shopId, entryId, { method: 'UPI', amountMinor: 12000 })

    expect((await readEntry(entryId)).status).toBe('COMPLETED')
    const payment = await paymentFor(entryId)
    expect(payment).toMatchObject({ status: 'PAID', method: 'UPI', amountMinor: 12000, refundedAt: null })
    expect(payment?.paidAt).toBeInstanceOf(Date)
    expect(await getTodayRevenue(shop.shopId)).toBe(12000)
  })

  it('records no payment when completed without one', async () => {
    const entryId = await inChair('A')

    await completeService(shop.shopId, entryId, null)

    expect((await readEntry(entryId)).status).toBe('COMPLETED')
    expect(await paymentFor(entryId)).toBeUndefined()
    expect(await getTodayRevenue(shop.shopId)).toBe(0)
  })

  it('records nothing when the service cannot be completed', async () => {
    const waiting = await join('A', shop.services.haircut)

    await expectDomainError(completeService(shop.shopId, waiting.id, { method: 'CASH', amountMinor: 15000 }), 'INVALID_TRANSITION')

    expect((await readEntry(waiting.id)).status).toBe('WAITING')
    expect(await paymentFor(waiting.id)).toBeUndefined()
  })

  it('never records a second payment for a repeated tap', async () => {
    const entryId = await inChair('A')

    await completeService(shop.shopId, entryId, { method: 'CASH', amountMinor: 15000 })
    await expectDomainError(completeService(shop.shopId, entryId, { method: 'CARD', amountMinor: 15000 }), 'INVALID_TRANSITION')

    const rows = await useDb().select().from(payments).where(eq(payments.queueEntryId, entryId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.method).toBe('CASH')
  })
})
