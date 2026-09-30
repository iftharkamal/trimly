// Queue service against a real PostgreSQL database (TEST_DATABASE_URL).
// Covers what the pure tests can't: database constraints, concurrency,
// and ETAs computed from the timestamps the database actually recorded.
import { and, eq, inArray, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../db'
import { queueEntries } from '../../db/schema'
import { createShopFixture, resetDatabase, type ShopFixture } from '../../testing/fixtures'
import { DomainError, type DomainErrorCode } from '../errors'
import {
  addCustomer,
  cancelEntry,
  completeService,
  getActiveQueue,
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
      const result = await useDb().execute<{ column_name: string }>(sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'queue_entries'
      `)
      const columns = result.rows.map(row => row.column_name)

      expect(columns).toContain('joined_at')
      expect(columns.filter(name => /position|rank|order|eta|estimate|wait/.test(name))).toEqual([])
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
