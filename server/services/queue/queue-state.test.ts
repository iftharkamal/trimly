import { describe, expect, it } from 'vitest'
import type { QueueEntryStatus } from '../../../shared/constants'
import {
  calculateCurrentServiceEnd,
  calculateCustomersAhead,
  calculateEstimatedEnd,
  calculateEstimatedStart,
  calculateJoinPreview,
  calculateQueuePosition,
  calculateQueueState,
  pickEarliestAvailableLane,
  type QueueEntryTiming
} from './queue-state'

const NOW = new Date('2026-09-30T10:00:00.000Z')

/** A time `minutes` relative to NOW (negative = in the past). */
function at(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

function entry(
  id: string,
  status: QueueEntryStatus,
  overrides: Partial<QueueEntryTiming> = {}
): QueueEntryTiming {
  return { id, status, joinedAt: at(-60), startedAt: null, durationMinutes: 20, ...overrides }
}

describe('calculateQueuePosition / calculateCustomersAhead', () => {
  const entries = [
    entry('c', 'WAITING', { joinedAt: at(-10) }),
    entry('a', 'WAITING', { joinedAt: at(-30) }),
    entry('b', 'WAITING', { joinedAt: at(-20) }),
    entry('x', 'IN_PROGRESS', { joinedAt: at(-40), startedAt: at(-5) }),
    entry('done', 'COMPLETED', { joinedAt: at(-50) })
  ]

  it('orders WAITING entries by joinedAt', () => {
    expect(calculateQueuePosition(entries, 'a')).toBe(1)
    expect(calculateQueuePosition(entries, 'b')).toBe(2)
    expect(calculateQueuePosition(entries, 'c')).toBe(3)
  })

  it('returns null for entries that are not waiting', () => {
    expect(calculateQueuePosition(entries, 'x')).toBeNull()
    expect(calculateQueuePosition(entries, 'done')).toBeNull()
    expect(calculateQueuePosition(entries, 'missing')).toBeNull()
    expect(calculateCustomersAhead(entries, 'x')).toBeNull()
  })

  it('counts the customer in the chair as ahead', () => {
    expect(calculateCustomersAhead(entries, 'a')).toBe(1)
    expect(calculateCustomersAhead(entries, 'c')).toBe(3)
  })

  it('does not count anyone in the chair when the barber is idle', () => {
    const idle = entries.filter(e => e.status !== 'IN_PROGRESS')
    expect(calculateCustomersAhead(idle, 'a')).toBe(0)
  })

  it('breaks joinedAt ties by id so the order is stable', () => {
    const tied = [entry('b', 'WAITING', { joinedAt: at(-5) }), entry('a', 'WAITING', { joinedAt: at(-5) })]
    expect(calculateQueuePosition(tied, 'a')).toBe(1)
    expect(calculateQueuePosition(tied, 'b')).toBe(2)
  })

  it('recalculates positions when the head of the queue leaves', () => {
    const afterFirstStarts = entries.map(e => (e.id === 'a' ? { ...e, status: 'IN_PROGRESS' as const } : e))
    expect(calculateQueuePosition(afterFirstStarts, 'b')).toBe(1)
  })
})

describe('calculateEstimatedStart / calculateEstimatedEnd', () => {
  it('starts now when nothing comes before', () => {
    expect(calculateEstimatedStart(null, NOW, 5)).toEqual(NOW)
  })

  it('adds the buffer after the previous service', () => {
    expect(calculateEstimatedStart(at(10), NOW, 5)).toEqual(at(15))
  })

  it('never estimates a start in the past', () => {
    expect(calculateEstimatedStart(at(-30), NOW, 5)).toEqual(NOW)
  })

  it('ends after the service duration', () => {
    expect(calculateEstimatedEnd(at(15), 30)).toEqual(at(45))
  })
})

describe('calculateCurrentServiceEnd', () => {
  it('uses the actual start time plus the duration', () => {
    const current = entry('x', 'IN_PROGRESS', { startedAt: at(-5), durationMinutes: 20 })
    expect(calculateCurrentServiceEnd(current, NOW)).toEqual(at(15))
  })

  it('assumes an overrunning service ends now', () => {
    const current = entry('x', 'IN_PROGRESS', { startedAt: at(-30), durationMinutes: 20 })
    expect(calculateCurrentServiceEnd(current, NOW)).toEqual(NOW)
  })
})

describe('calculateQueueState', () => {
  it('handles an empty, idle queue', () => {
    const state = calculateQueueState([], { now: NOW, bufferMinutes: 5 })
    expect(state.current).toBeNull()
    expect(state.waiting).toEqual([])
    expect(state.nextAvailableAt).toEqual(NOW)
  })

  it('chains ETAs from the current service through the waiting queue with buffers', () => {
    const state = calculateQueueState(
      [
        entry('current', 'IN_PROGRESS', { startedAt: at(-5), durationMinutes: 20 }),
        entry('first', 'WAITING', { joinedAt: at(-20), durationMinutes: 10 }),
        entry('second', 'WAITING', { joinedAt: at(-10), durationMinutes: 30 })
      ],
      { now: NOW, bufferMinutes: 5 }
    )

    expect(state.current).toMatchObject({ elapsedMinutes: 5, estimatedEnd: at(15), isOverrunning: false })
    expect(state.waiting.map(w => [w.entry.id, w.position, w.customersAhead])).toEqual([
      ['first', 1, 1],
      ['second', 2, 2]
    ])
    // current ends +15, buffer → first +20..+30, buffer → second +35..+65
    expect(state.waiting[0]).toMatchObject({ estimatedStart: at(20), estimatedEnd: at(30), waitMinutes: 20 })
    expect(state.waiting[1]).toMatchObject({ estimatedStart: at(35), estimatedEnd: at(65), waitMinutes: 35 })
    expect(state.nextAvailableAt).toEqual(at(70))
  })

  it('pushes the queue forward from now when the current service overruns', () => {
    const state = calculateQueueState(
      [
        entry('current', 'IN_PROGRESS', { startedAt: at(-30), durationMinutes: 20 }),
        entry('first', 'WAITING', { durationMinutes: 10 })
      ],
      { now: NOW, bufferMinutes: 5 }
    )

    expect(state.current).toMatchObject({ elapsedMinutes: 30, estimatedEnd: NOW, isOverrunning: true })
    expect(state.waiting[0]?.estimatedStart).toEqual(at(5))
  })

  it('uses the actual end of the last service when the barber is idle', () => {
    // Finished 2 minutes ago with a 5-minute buffer → next starts in 3 minutes.
    const state = calculateQueueState([entry('first', 'WAITING', { durationMinutes: 10 })], {
      now: NOW,
      bufferMinutes: 5,
      lastServiceEndedAt: at(-2)
    })

    expect(state.waiting[0]).toMatchObject({ customersAhead: 0, estimatedStart: at(3), waitMinutes: 3 })
  })

  it('ignores a last service that ended longer ago than the buffer', () => {
    const state = calculateQueueState([entry('first', 'WAITING')], {
      now: NOW,
      bufferMinutes: 5,
      lastServiceEndedAt: at(-60)
    })

    expect(state.waiting[0]?.estimatedStart).toEqual(NOW)
  })

  it('supports a zero buffer', () => {
    const state = calculateQueueState(
      [
        entry('current', 'IN_PROGRESS', { startedAt: at(-5), durationMinutes: 20 }),
        entry('first', 'WAITING', { durationMinutes: 10 })
      ],
      { now: NOW, bufferMinutes: 0 }
    )

    expect(state.waiting[0]?.estimatedStart).toEqual(at(15))
    expect(state.nextAvailableAt).toEqual(at(25))
  })

  it('rounds waiting minutes up', () => {
    const now = new Date(NOW.getTime() + 30_000) // 30 seconds past
    const state = calculateQueueState(
      [
        entry('current', 'IN_PROGRESS', { startedAt: at(-5), durationMinutes: 20 }),
        entry('first', 'WAITING')
      ],
      { now, bufferMinutes: 0 }
    )

    // Starts at +15:00, now is +0:30 → 14.5 minutes → 15.
    expect(state.waiting[0]?.waitMinutes).toBe(15)
  })

  it('ignores finished entries', () => {
    const state = calculateQueueState(
      [
        entry('done', 'COMPLETED', { startedAt: at(-30) }),
        entry('gone', 'CANCELLED'),
        entry('absent', 'NO_SHOW'),
        entry('first', 'WAITING')
      ],
      { now: NOW, bufferMinutes: 5 }
    )

    expect(state.current).toBeNull()
    expect(state.waiting.map(w => w.entry.id)).toEqual(['first'])
  })

  it('returns the caller’s entry objects untouched', () => {
    const rich = { ...entry('first', 'WAITING'), customerName: 'Ali' }
    const state = calculateQueueState([rich], { now: NOW, bufferMinutes: 5 })
    expect(state.waiting[0]?.entry).toBe(rich)
  })
})

describe('pickEarliestAvailableLane', () => {
  function lane(name: string, nextAvailableAt: Date, waitingCount: number) {
    const waiting = Array.from({ length: waitingCount }, (_, i) => entry(`${name}-${i}`, 'WAITING'))
    return { name, state: { ...calculateQueueState(waiting, { now: NOW, bufferMinutes: 0 }), nextAvailableAt } }
  }

  it('returns null when there are no lanes', () => {
    expect(pickEarliestAvailableLane([])).toBeNull()
  })

  it('picks the lane that can start soonest', () => {
    const picked = pickEarliestAvailableLane([lane('a', at(30), 1), lane('b', at(10), 3)])
    expect(picked?.name).toBe('b')
  })

  it('prefers the shorter queue on a tie', () => {
    const picked = pickEarliestAvailableLane([lane('a', at(10), 2), lane('b', at(10), 1)])
    expect(picked?.name).toBe('b')
  })
})

describe('calculateJoinPreview', () => {
  it('puts a new customer straight in the chair when the barber is idle', () => {
    const state = calculateQueueState([], { now: NOW, bufferMinutes: 5 })
    expect(calculateJoinPreview(state, NOW)).toEqual({ position: 1, customersAhead: 0, estimatedStart: NOW, waitMinutes: 0 })
  })

  it('places a new customer after everyone waiting and the customer in the chair', () => {
    const state = calculateQueueState(
      [entry('x', 'IN_PROGRESS', { startedAt: at(-5), durationMinutes: 20 }), entry('a', 'WAITING', { durationMinutes: 10 })],
      { now: NOW, bufferMinutes: 5 }
    )
    // x ends +15, a +20..+30, new customer +35
    expect(calculateJoinPreview(state, NOW)).toEqual({ position: 2, customersAhead: 2, estimatedStart: at(35), waitMinutes: 35 })
  })
})
