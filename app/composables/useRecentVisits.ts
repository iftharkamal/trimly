// What this device is in the middle of: a live place in a queue or an upcoming
// booking, at any shop. Read from local storage and refreshed from the server,
// so the home page can offer "pick up where you left off". Client only.
import type { BookingDto } from '#shared/types/booking'
import type { ApiSuccess, QueueTrackingDto } from '#shared/types/queue'

export type RecentVisit =
  | { kind: 'queue', code: string, tracking: QueueTrackingDto }
  | { kind: 'booking', code: string, booking: BookingDto }

const ACTIVE_QUEUE_STATES = ['WAITING', 'GETTING_CLOSE', 'YOU_ARE_NEXT', 'IN_PROGRESS']
const ACTIVE_BOOKING_STATUSES = ['BOOKED', 'CHECKED_IN']

export function useRecentVisits() {
  const visits = ref<RecentVisit[]>([])
  const loaded = ref(false)

  onMounted(async () => {
    const found = await Promise.all(listRememberedPlaces().map(async (place): Promise<RecentVisit | null> => {
      try {
        if (place.kind === 'queue') {
          const { data } = await $fetch<ApiSuccess<QueueTrackingDto>>(`/api/track/${place.code}`)
          if (ACTIVE_QUEUE_STATES.includes(data.state)) {
            return { kind: 'queue', code: place.code, tracking: data }
          }
        }
        else {
          const { data } = await $fetch<ApiSuccess<BookingDto>>(`/api/bookings/${place.code}`)
          if (ACTIVE_BOOKING_STATUSES.includes(data.status)) {
            return { kind: 'booking', code: place.code, booking: data }
          }
        }
      }
      catch {
        // Unknown or expired: fall through and forget it.
      }
      // Finished, cancelled or gone: stop offering it.
      forgetPlace(place)
      return null
    }))

    // Live queue places first, then bookings soonest first.
    visits.value = found
      .filter((visit): visit is RecentVisit => visit !== null)
      .sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'queue' ? -1 : 1
        }
        return a.kind === 'booking' && b.kind === 'booking' ? a.booking.startsAt.localeCompare(b.booking.startsAt) : 0
      })
    loaded.value = true
  })

  return { visits, loaded }
}
