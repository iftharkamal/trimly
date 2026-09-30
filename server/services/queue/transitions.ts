import type { QueueEntryStatus } from '../../../shared/constants'

// Allowed status changes. COMPLETED, CANCELLED and NO_SHOW are final.
const ALLOWED_TRANSITIONS: Record<QueueEntryStatus, readonly QueueEntryStatus[]> = {
  WAITING: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
}

export function canTransition(from: QueueEntryStatus, to: QueueEntryStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** Statuses an entry may be in to move to `to`; used as the guard in conditional updates. */
export function statusesThatCanTransitionTo(to: QueueEntryStatus): QueueEntryStatus[] {
  return (Object.keys(ALLOWED_TRANSITIONS) as QueueEntryStatus[]).filter(from => canTransition(from, to))
}
