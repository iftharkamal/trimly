// Scenario tests for the queue engine's pure calculations, with a fixed clock.
// Database-level guarantees (one IN_PROGRESS per barber, nothing stored) are
// covered in queue.service.integration.test.ts.
import { describe, expect, it } from 'vitest'
import { calculateQueueState, type QueueEntryTiming, type QueueState, type QueueStateOptions } from './queue-state'

const NOW = new Date('2026-09-30T10:00:00.000Z')
const MINUTE_MS = 60_000

// Durations from the seeded shop.
const HAIRCUT = 20
const BEARD = 10
const HAIRCUT_AND_BEARD = 30

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MINUTE_MS)
}

function minutesAfterNow(date: Date): number {
  return (date.getTime() - NOW.getTime()) / MINUTE_MS
}

function offsetInMinutes(date: Date | null | undefined): number | null {
  return date ? minutesAfterNow(date) : null
}

function waiting(id: string, joinedMinutesAgo: number, durationMinutes: number): QueueEntryTiming {
  return { id, status: 'WAITING', orderAt: minutesFromNow(-joinedMinutesAgo), startedAt: null, durationMinutes }
}

function inProgress(id: string, startedMinutesAgo: number, durationMinutes: number): QueueEntryTiming {
  return {
    id,
    status: 'IN_PROGRESS',
    orderAt: minutesFromNow(-startedMinutesAgo - 10),
    startedAt: minutesFromNow(-startedMinutesAgo),
    durationMinutes
  }
}

function withStatus(entry: QueueEntryTiming, status: QueueEntryTiming['status']): QueueEntryTiming {
  return { ...entry, status }
}

function queue(entries: QueueEntryTiming[], options: Partial<QueueStateOptions> = {}): QueueState<QueueEntryTiming> {
  return calculateQueueState(entries, { now: NOW, bufferMinutes: 5, ...options })
}

/** Waiting entries as { id, position, ahead, start, end, wait } with times in minutes from NOW. */
function summarize(state: QueueState<QueueEntryTiming>) {
  return state.waiting.map(item => ({
    id: item.entry.id,
    position: item.position,
    ahead: item.customersAhead,
    start: minutesAfterNow(item.estimatedStart),
    end: minutesAfterNow(item.estimatedEnd),
    wait: item.waitMinutes
  }))
}

function waitingEntry(state: QueueState<QueueEntryTiming>, id: string) {
  const item = summarize(state).find(entry => entry.id === id)
  if (!item) {
    throw new Error(`Entry ${id} is not waiting`)
  }
  return item
}

describe('queue engine scenarios', () => {
  it('1. empty queue: nobody is served and a new customer could start now', () => {
    const state = queue([])

    expect(state.current).toBeNull()
    expect(state.waiting).toEqual([])
    expect(offsetInMinutes(state.nextAvailableAt)).toBe(0)
  })

  it('2. one customer waiting: first in line, starts now', () => {
    const state = queue([waiting('a', 3, HAIRCUT)])

    expect(state.current).toBeNull()
    expect(summarize(state)).toEqual([{ id: 'a', position: 1, ahead: 0, start: 0, end: 20, wait: 0 }])
    // The next customer would start after this haircut plus the buffer.
    expect(offsetInMinutes(state.nextAvailableAt)).toBe(25)
  })

  it('3. multiple waiting customers: ordered by join time, ETAs chained with buffers', () => {
    // Deliberately passed out of order.
    const state = queue([waiting('c', 1, HAIRCUT_AND_BEARD), waiting('a', 10, HAIRCUT), waiting('b', 5, BEARD)])

    expect(summarize(state)).toEqual([
      { id: 'a', position: 1, ahead: 0, start: 0, end: 20, wait: 0 },
      { id: 'b', position: 2, ahead: 1, start: 25, end: 35, wait: 25 },
      { id: 'c', position: 3, ahead: 2, start: 40, end: 70, wait: 40 }
    ])
  })

  it('4. current customer in progress: expected end comes from the actual start time', () => {
    const state = queue([inProgress('x', 5, HAIRCUT)])

    expect(state.current).toMatchObject({ elapsedMinutes: 5, isOverrunning: false })
    expect(state.current?.entry.id).toBe('x')
    expect(offsetInMinutes(state.current?.estimatedEnd)).toBe(15)
    expect(state.waiting).toEqual([])
    expect(offsetInMinutes(state.nextAvailableAt)).toBe(20)
  })

  describe('5. customer joins while another customer is in progress', () => {
    it('is first in line but has the customer in the chair ahead', () => {
      const state = queue([inProgress('x', 5, HAIRCUT), waiting('new', 0, BEARD)])

      expect(summarize(state)).toEqual([{ id: 'new', position: 1, ahead: 1, start: 20, end: 30, wait: 20 }])
    })

    it('queues behind customers already waiting', () => {
      const state = queue([inProgress('x', 5, HAIRCUT), waiting('a', 8, HAIRCUT), waiting('new', 0, BEARD)])

      // x ends +15, a +20..+40, new +45..+55
      expect(waitingEntry(state, 'new')).toEqual({ id: 'new', position: 2, ahead: 2, start: 45, end: 55, wait: 45 })
    })
  })

  it('6. current customer completes: next customer moves up but is not started automatically', () => {
    const current = inProgress('x', 20, HAIRCUT)
    const next = waiting('a', 15, BEARD)

    const before = queue([current, next])
    expect(waitingEntry(before, 'a')).toMatchObject({ position: 1, ahead: 1 })

    // x completed just now; completed entries are not active, only its end time matters.
    const after = queue([withStatus(current, 'COMPLETED'), next], { lastServiceEndedAt: NOW })

    expect(after.current).toBeNull()
    expect(waitingEntry(after, 'a')).toEqual({ id: 'a', position: 1, ahead: 0, start: 5, end: 15, wait: 5 })
  })

  it('7. customer cancels: everyone behind moves up and gets an earlier ETA', () => {
    const a = waiting('a', 30, HAIRCUT)
    const b = waiting('b', 20, BEARD)
    const c = waiting('c', 10, HAIRCUT_AND_BEARD)

    const before = queue([a, b, c])
    expect(waitingEntry(before, 'c')).toMatchObject({ position: 3, ahead: 2, start: 40 })

    const after = queue([a, withStatus(b, 'CANCELLED'), c])
    // b's 10 minutes and one buffer are gone.
    expect(waitingEntry(after, 'c')).toMatchObject({ position: 2, ahead: 1, start: 25 })
    expect(summarize(after).map(entry => entry.id)).toEqual(['a', 'c'])
  })

  it('8. customer is marked no-show: the next customer can start now, with no buffer', () => {
    const a = waiting('a', 30, HAIRCUT)
    const b = waiting('b', 20, BEARD)

    const after = queue([withStatus(a, 'NO_SHOW'), b])

    // No service happened, so there is nothing to buffer after.
    expect(summarize(after)).toEqual([{ id: 'b', position: 1, ahead: 0, start: 0, end: 10, wait: 0 }])
  })

  it('9. service durations differ: each ETA uses that customer’s own service duration', () => {
    const state = queue(
      [waiting('a', 30, HAIRCUT), waiting('b', 20, BEARD), waiting('c', 10, HAIRCUT_AND_BEARD)],
      { bufferMinutes: 0 }
    )

    expect(summarize(state).map(({ id, start, end }) => ({ id, start, end }))).toEqual([
      { id: 'a', start: 0, end: 20 },
      { id: 'b', start: 20, end: 30 },
      { id: 'c', start: 30, end: 60 }
    ])
  })

  describe('10. buffer time affects ETA', () => {
    const entries = [inProgress('x', 5, HAIRCUT), waiting('a', 20, HAIRCUT), waiting('b', 10, BEARD)]

    it.each([
      { buffer: 0, a: 15, b: 35, next: 45 },
      { buffer: 5, a: 20, b: 45, next: 60 },
      { buffer: 10, a: 25, b: 55, next: 75 }
    ])('adds $buffer minutes between each service', ({ buffer, a, b, next }) => {
      const state = queue(entries, { bufferMinutes: buffer })

      expect(waitingEntry(state, 'a').start).toBe(a)
      expect(waitingEntry(state, 'b').start).toBe(b)
      expect(offsetInMinutes(state.nextAvailableAt)).toBe(next)
    })

    it('does not delay the first customer when the barber is idle', () => {
      const state = queue([waiting('a', 5, HAIRCUT)], { bufferMinutes: 10 })

      expect(waitingEntry(state, 'a').start).toBe(0)
    })

    it('applies after a service that has just ended', () => {
      const state = queue([waiting('a', 5, HAIRCUT)], { bufferMinutes: 10, lastServiceEndedAt: minutesFromNow(-4) })

      expect(waitingEntry(state, 'a').start).toBe(6)
    })
  })

  it('11. customer ahead has a longer service: my ETA moves later by that duration', () => {
    const state = queue([waiting('ahead', 10, HAIRCUT_AND_BEARD), waiting('me', 5, BEARD)])

    expect(waitingEntry(state, 'me')).toMatchObject({ position: 2, ahead: 1, start: 35, wait: 35 })
  })

  it('12. customer ahead has a shorter service: my ETA is correspondingly earlier', () => {
    const shorter = queue([waiting('ahead', 10, BEARD), waiting('me', 5, BEARD)])
    const longer = queue([waiting('ahead', 10, HAIRCUT_AND_BEARD), waiting('me', 5, BEARD)])

    expect(waitingEntry(shorter, 'me')).toMatchObject({ position: 2, ahead: 1, start: 15, wait: 15 })
    // The difference is exactly the difference in the services ahead.
    expect(waitingEntry(longer, 'me').start - waitingEntry(shorter, 'me').start).toBe(HAIRCUT_AND_BEARD - BEARD)
  })

  it('13. no current customer but multiple waiting: first starts now, nobody counted in the chair', () => {
    const state = queue([waiting('a', 30, HAIRCUT), waiting('b', 20, BEARD), waiting('c', 10, HAIRCUT_AND_BEARD)])

    expect(state.current).toBeNull()
    expect(summarize(state).map(({ id, ahead, start }) => ({ id, ahead, start }))).toEqual([
      { id: 'a', ahead: 0, start: 0 },
      { id: 'b', ahead: 1, start: 25 },
      { id: 'c', ahead: 2, start: 40 }
    ])
  })

  describe('15. queue position is derived, not stored', () => {
    it('comes only from status and join order, not from the input order', () => {
      const entries = [waiting('a', 30, HAIRCUT), waiting('b', 20, BEARD), waiting('c', 10, HAIRCUT_AND_BEARD)]
      const expected = summarize(queue(entries))

      expect(summarize(queue([...entries].reverse()))).toEqual(expected)
      expect(summarize(queue([entries[1]!, entries[2]!, entries[0]!]))).toEqual(expected)
    })

    it('is computed without writing anything onto the entries', () => {
      const entries = Object.freeze([
        Object.freeze(inProgress('x', 5, HAIRCUT)),
        Object.freeze(waiting('a', 20, HAIRCUT)),
        Object.freeze(waiting('b', 10, BEARD))
      ])

      // Frozen input: any attempt to store a position or ETA on an entry would throw.
      const state = calculateQueueState(entries, { now: NOW, bufferMinutes: 5 })

      expect(state.waiting.map(item => item.position)).toEqual([1, 2])
      expect(Object.keys(entries[1]!)).toEqual(['id', 'status', 'orderAt', 'startedAt', 'durationMinutes'])
    })
  })

  describe('16. ETA is recalculated after completion', () => {
    it('moves earlier when the current service finishes early', () => {
      const current = inProgress('x', 5, HAIRCUT) // planned to end at +15
      const next = waiting('a', 10, BEARD)

      const before = queue([current, next])
      expect(waitingEntry(before, 'a').start).toBe(20)

      // Finished now, 15 minutes early.
      const after = queue([withStatus(current, 'COMPLETED'), next], { lastServiceEndedAt: NOW })
      expect(waitingEntry(after, 'a').start).toBe(5)
    })

    it('uses the actual end time when the service ran over', () => {
      const current = inProgress('x', 30, HAIRCUT) // planned to end at -10
      const next = waiting('a', 25, BEARD)

      const before = queue([current, next])
      expect(before.current?.isOverrunning).toBe(true)
      expect(waitingEntry(before, 'a').start).toBe(5)

      // Actually finished 3 minutes ago.
      const after = queue([withStatus(current, 'COMPLETED'), next], { lastServiceEndedAt: minutesFromNow(-3) })
      expect(waitingEntry(after, 'a').start).toBe(2)
    })
  })
})

describe('appointments: holding booked time', () => {
  function hold(fromMinutes: number, toMinutes: number) {
    return { start: minutesFromNow(fromMinutes), end: minutesFromNow(toMinutes) }
  }

  it('a waiting customer who finishes (plus buffer) before the booking goes first', () => {
    // Haircut 0–20, buffer to 25, appointment at 30.
    const state = queue([waiting('a', 5, HAIRCUT)], { holds: [hold(30, 50)] })
    expect(waitingEntry(state, 'a')).toMatchObject({ start: 0, end: 20 })
  })

  it('fits exactly when service plus buffer ends at the booked time', () => {
    const state = queue([waiting('a', 5, HAIRCUT)], { holds: [hold(25, 45)] })
    expect(waitingEntry(state, 'a').start).toBe(0)
  })

  it('a customer who would run into the booking waits until after it (plus buffer)', () => {
    const state = queue([waiting('a', 5, HAIRCUT)], { holds: [hold(20, 40)] })
    expect(waitingEntry(state, 'a')).toMatchObject({ position: 1, start: 45, end: 65, wait: 45 })
  })

  it('skips several bookings in a row until the service fits', () => {
    // After the first booking: 45–65 (+5) runs into the second at 50, so after that: 75.
    const state = queue([waiting('a', 5, HAIRCUT)], { holds: [hold(50, 70), hold(20, 40)] })
    expect(waitingEntry(state, 'a').start).toBe(75)
  })

  it('plans each waiting customer in turn around the booking', () => {
    // Beard 0–10 (+5 = 15) fits before 20; the haircut would not, so it goes after: 45.
    const state = queue([waiting('a', 10, BEARD), waiting('b', 5, HAIRCUT)], { holds: [hold(20, 40)] })
    expect(summarize(state).map(({ id, start }) => ({ id, start }))).toEqual([
      { id: 'a', start: 0 },
      { id: 'b', start: 45 }
    ])
  })

  it('keeps first come, first served: a gap too short for #1 is not given to #2', () => {
    // #1's haircut can't fit before 15, so #1 goes at 40; #2's short beard waits behind #1.
    const state = queue([waiting('a', 10, HAIRCUT), waiting('b', 5, BEARD)], { holds: [hold(15, 35)] })
    expect(waitingEntry(state, 'a').start).toBe(40)
    expect(waitingEntry(state, 'b').start).toBe(65)
  })

  it('works after the current service too', () => {
    // Current ends +15; beard 20–30 (+5 = 35) runs into the booking at 30, so after it: 55.
    const state = queue(
      [inProgress('x', 5, HAIRCUT), waiting('a', 5, BEARD)],
      { holds: [hold(30, 50)] }
    )
    expect(waitingEntry(state, 'a').start).toBe(55)
  })

  it('ignores bookings that are already over', () => {
    const state = queue([waiting('a', 5, HAIRCUT)], { holds: [hold(-40, -20)] })
    expect(waitingEntry(state, 'a').start).toBe(0)
  })

  it('keeps holding a late booking until its end time', () => {
    // Booked from 10 minutes ago, not checked in yet: the barber waits until it would have ended.
    const state = queue([waiting('a', 5, BEARD)], { holds: [hold(-10, 10)] })
    expect(waitingEntry(state, 'a').start).toBe(15)
  })

  it('"join now" skips booked time', () => {
    expect(offsetInMinutes(queue([], { holds: [hold(0, 20)] }).nextAvailableAt)).toBe(25)
    // Anything could still start before a booking that's far enough away.
    expect(offsetInMinutes(queue([], { holds: [hold(30, 50)] }).nextAvailableAt)).toBe(0)
  })

  it('a checked-in appointment is ordered by its booked time, not its arrival', () => {
    // Walk-in A joined 30 min ago; the appointment was booked for 10 min ago
    // (checked in just now); walk-in B joined 5 min ago.
    const state = queue([
      waiting('walk-in-a', 30, HAIRCUT),
      { ...waiting('appointment', 10, HAIRCUT) },
      waiting('walk-in-b', 5, BEARD)
    ])
    expect(summarize(state).map(item => item.id)).toEqual(['walk-in-a', 'appointment', 'walk-in-b'])
  })
})
