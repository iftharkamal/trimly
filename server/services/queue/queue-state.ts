// Pure queue calculations: no database, no clock, no framework.
// Every function takes the data it needs (including `now`), so it is
// deterministic and unit-testable. Nothing here is ever persisted.
import type { QueueEntryStatus } from '../../../shared/constants'

const MINUTE_MS = 60_000

/** The fields of a queue entry the calculations depend on. */
export interface QueueEntryTiming {
  id: string
  status: QueueEntryStatus
  /**
   * Queue order key: when the customer joined, or for a checked-in
   * appointment, its booked time.
   */
  orderAt: Date
  startedAt: Date | null
  /** Snapshotted from the selected service when the customer joined. */
  durationMinutes: number
}

/** Time the barber has promised to someone else, e.g. an upcoming appointment. */
export interface TimeHold {
  start: Date
  end: Date
}

export interface QueueStateOptions {
  now: Date
  /** Gap between one service ending and the next starting. */
  bufferMinutes: number
  /**
   * Actual end time of the barber's most recent finished service, if any.
   * Used when nobody is in the chair, so an early or late finish moves the queue.
   */
  lastServiceEndedAt?: Date | null
  /** Booked appointments not yet checked in: waiting customers are planned around them. */
  holds?: readonly TimeHold[]
}

export interface CurrentServiceState<T> {
  entry: T
  elapsedMinutes: number
  estimatedEnd: Date
  /** The service has run past its planned duration. */
  isOverrunning: boolean
}

export interface WaitingEntryState<T> {
  entry: T
  /** 1-based rank among WAITING entries; 1 = next to be served. */
  position: number
  /** Everyone before this customer, including anyone currently in the chair. */
  customersAhead: number
  estimatedStart: Date
  estimatedEnd: Date
  /** Whole minutes until estimatedStart, rounded up. */
  waitMinutes: number
}

export interface QueueState<T> {
  current: CurrentServiceState<T> | null
  waiting: WaitingEntryState<T>[]
  /** When a customer joining right now would be expected to start. */
  nextAvailableAt: Date
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS)
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MINUTE_MS
}

/** Queue order: earliest orderAt first, id as a stable tiebreak. */
export function compareQueueOrder(a: QueueEntryTiming, b: QueueEntryTiming): number {
  const diff = a.orderAt.getTime() - b.orderAt.getTime()
  if (diff !== 0) {
    return diff
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** WAITING entries of one barber, in queue order. */
export function getWaitingInOrder<T extends QueueEntryTiming>(entries: readonly T[]): T[] {
  return entries.filter(entry => entry.status === 'WAITING').sort(compareQueueOrder)
}

function countInProgress(entries: readonly QueueEntryTiming[]): number {
  return entries.filter(entry => entry.status === 'IN_PROGRESS').length
}

/**
 * Position of a WAITING entry within one barber's entries (1 = next),
 * or null if the entry is not waiting.
 */
export function calculateQueuePosition(entries: readonly QueueEntryTiming[], entryId: string): number | null {
  const index = getWaitingInOrder(entries).findIndex(entry => entry.id === entryId)
  return index === -1 ? null : index + 1
}

/**
 * Number of customers before a WAITING entry, including anyone in the chair,
 * or null if the entry is not waiting.
 */
export function calculateCustomersAhead(entries: readonly QueueEntryTiming[], entryId: string): number | null {
  const position = calculateQueuePosition(entries, entryId)
  return position === null ? null : position - 1 + countInProgress(entries)
}

/**
 * When the next service can start: `now` if the barber has nothing before it,
 * otherwise after the previous service plus the buffer, but never in the past.
 */
export function calculateEstimatedStart(previousEnd: Date | null, now: Date, bufferMinutes: number): Date {
  return previousEnd ? laterOf(addMinutes(previousEnd, bufferMinutes), now) : now
}

export function calculateEstimatedEnd(estimatedStart: Date, durationMinutes: number): Date {
  return addMinutes(estimatedStart, durationMinutes)
}

/**
 * Moves a planned start past any held time the service would run into.
 *
 * A service fits before a hold only if it ends, plus the buffer, by the
 * hold's start; otherwise it waits until the hold ends plus the buffer.
 * Order is kept (first come, first served): a gap too short for this
 * customer stays unused rather than being given to someone behind them.
 * With `durationMinutes` 0 this answers "when could anything start next?".
 */
export function calculateStartAroundHolds(
  start: Date,
  durationMinutes: number,
  holds: readonly TimeHold[],
  bufferMinutes: number
): Date {
  let candidate = start
  const ordered = [...holds].sort((a, b) => a.start.getTime() - b.start.getTime())
  for (const hold of ordered) {
    if (addMinutes(hold.end, bufferMinutes) <= candidate) {
      continue
    }
    const fitsBefore = addMinutes(candidate, durationMinutes + bufferMinutes) <= hold.start
    if (fitsBefore) {
      break
    }
    candidate = laterOf(candidate, addMinutes(hold.end, bufferMinutes))
  }
  return candidate
}

/**
 * Expected end of a service already in progress, from its actual start time.
 * An overrunning service is assumed to end `now`, so estimates never fall in the past.
 */
export function calculateCurrentServiceEnd(entry: QueueEntryTiming, now: Date): Date {
  const startedAt = entry.startedAt ?? now
  return laterOf(calculateEstimatedEnd(startedAt, entry.durationMinutes), now)
}

/**
 * Full state of one barber's queue: the current service, a position and
 * ETA for every waiting customer, and when a new customer could start.
 *
 * `entries` are one barber's active (WAITING / IN_PROGRESS) entries; any
 * other statuses are ignored.
 */
export function calculateQueueState<T extends QueueEntryTiming>(
  entries: readonly T[],
  options: QueueStateOptions
): QueueState<T> {
  const { now, bufferMinutes } = options
  const holds = options.holds ?? []
  const inProgress = entries.filter(entry => entry.status === 'IN_PROGRESS')

  // Normally at most one (enforced by the database). If there are more,
  // the barber is free when the last of them is expected to end.
  let current: CurrentServiceState<T> | null = null
  for (const entry of inProgress) {
    const estimatedEnd = calculateCurrentServiceEnd(entry, now)
    if (!current || estimatedEnd > current.estimatedEnd) {
      const startedAt = entry.startedAt ?? now
      current = {
        entry,
        elapsedMinutes: Math.max(0, Math.floor(minutesBetween(startedAt, now))),
        estimatedEnd,
        isOverrunning: calculateEstimatedEnd(startedAt, entry.durationMinutes) < now
      }
    }
  }

  let previousEnd: Date | null = current?.estimatedEnd ?? options.lastServiceEndedAt ?? null

  const waiting = getWaitingInOrder(entries).map((entry, index): WaitingEntryState<T> => {
    const estimatedStart = calculateStartAroundHolds(
      calculateEstimatedStart(previousEnd, now, bufferMinutes),
      entry.durationMinutes,
      holds,
      bufferMinutes
    )
    const estimatedEnd = calculateEstimatedEnd(estimatedStart, entry.durationMinutes)
    previousEnd = estimatedEnd

    return {
      entry,
      position: index + 1,
      customersAhead: index + inProgress.length,
      estimatedStart,
      estimatedEnd,
      waitMinutes: Math.max(0, Math.ceil(minutesBetween(now, estimatedStart)))
    }
  })

  return {
    current,
    waiting,
    // Duration unknown before joining: the earliest moment outside held time.
    nextAvailableAt: calculateStartAroundHolds(calculateEstimatedStart(previousEnd, now, bufferMinutes), 0, holds, bufferMinutes)
  }
}

/**
 * For "any barber": the lane where a new customer would start soonest,
 * preferring the shorter queue on a tie. Returns null for no lanes.
 */
export function pickEarliestAvailableLane<L extends { state: QueueState<unknown> }>(lanes: readonly L[]): L | null {
  let best: L | null = null
  for (const lane of lanes) {
    if (!best) {
      best = lane
      continue
    }
    const diff = lane.state.nextAvailableAt.getTime() - best.state.nextAvailableAt.getTime()
    if (diff < 0 || (diff === 0 && lane.state.waiting.length < best.state.waiting.length)) {
      best = lane
    }
  }
  return best
}

export interface JoinPreview {
  /** Position a customer joining now would get (1 = next). */
  position: number
  customersAhead: number
  estimatedStart: Date
  waitMinutes: number
}

/** What a customer joining this barber's queue right now could expect. */
export function calculateJoinPreview(state: QueueState<unknown>, now: Date): JoinPreview {
  return {
    position: state.waiting.length + 1,
    customersAhead: state.waiting.length + (state.current ? 1 : 0),
    estimatedStart: state.nextAvailableAt,
    waitMinutes: Math.max(0, Math.ceil(minutesBetween(now, state.nextAvailableAt)))
  }
}
