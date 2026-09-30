// Pure queue calculations: no database, no clock, no framework.
// Every function takes the data it needs (including `now`), so it is
// deterministic and unit-testable. Nothing here is ever persisted.
import type { QueueEntryStatus } from '../../../shared/constants'

const MINUTE_MS = 60_000

/** The fields of a queue entry the calculations depend on. */
export interface QueueEntryTiming {
  id: string
  status: QueueEntryStatus
  joinedAt: Date
  startedAt: Date | null
  /** Snapshotted from the selected service when the customer joined. */
  durationMinutes: number
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

/** Queue order: earliest joinedAt first, id as a stable tiebreak. */
export function compareQueueOrder(a: QueueEntryTiming, b: QueueEntryTiming): number {
  const diff = a.joinedAt.getTime() - b.joinedAt.getTime()
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
    const estimatedStart = calculateEstimatedStart(previousEnd, now, bufferMinutes)
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
    nextAvailableAt: calculateEstimatedStart(previousEnd, now, bufferMinutes)
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
