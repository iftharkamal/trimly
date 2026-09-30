import { GETTING_CLOSE_MINUTES, type QueueEntryStatus, type TrackingState } from '../../../shared/constants'

/** How an entry is presented on its customer's status page. */
export function getTrackingState(entry: {
  status: QueueEntryStatus
  position: number | null
  waitMinutes: number | null
}): TrackingState {
  switch (entry.status) {
    case 'IN_PROGRESS':
      return 'IN_PROGRESS'
    case 'COMPLETED':
      return 'COMPLETED'
    // A no-show is shown as cancelled; the page explains using the status.
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'CANCELLED'
    case 'WAITING':
      if (entry.position === 1) {
        return 'YOU_ARE_NEXT'
      }
      return entry.waitMinutes !== null && entry.waitMinutes <= GETTING_CLOSE_MINUTES ? 'GETTING_CLOSE' : 'WAITING'
  }
}
