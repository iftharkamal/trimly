// Response shapes of the queue API (dates are ISO 8601 strings).
// All positions and estimates are calculated by the server.
import type { QueueEntrySource, QueueEntryStatus, TrackingState } from '../constants'

export interface ApiSuccess<T> {
  data: T
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: { path: string, message: string }[]
  }
}

/** A queue entry as the shop owner sees it. */
export interface QueueEntryDto {
  id: string
  status: QueueEntryStatus
  source: QueueEntrySource
  serviceName: string
  durationMinutes: number
  priceMinor: number
  joinedAt: string
  startedAt: string | null
  customer: {
    id: string
    name: string
    phone: string | null
  }
}

/** A queue entry as the public sees it: no identity. */
export interface PublicQueueEntryDto {
  serviceName: string
  durationMinutes: number
}

export interface CurrentServiceDto<E> {
  entry: E
  elapsedMinutes: number
  estimatedEnd: string
  isOverrunning: boolean
}

export interface WaitingEntryDto<E> {
  entry: E
  position: number
  customersAhead: number
  estimatedStart: string
  estimatedEnd: string
  waitMinutes: number
}

/** What a customer joining a barber's queue right now could expect. */
export interface JoinPreviewDto {
  position: number
  customersAhead: number
  estimatedStart: string
  waitMinutes: number
}

/** A booked appointment holding time, not yet checked in. Identity only in the owner view. */
export interface UpcomingAppointmentDto {
  startsAt: string
  endsAt: string
  serviceName: string
  appointmentId?: string
  customerName?: string
}

export interface BarberQueueDto<E> {
  barber: {
    id: string
    name: string
    isActive: boolean
  }
  current: CurrentServiceDto<E> | null
  waiting: WaitingEntryDto<E>[]
  /** When a customer joining this barber now would be expected to start. */
  nextAvailableAt: string
  joinPreview: JoinPreviewDto
  upcoming: UpcomingAppointmentDto[]
}

export interface OwnerShopQueueDto {
  view: 'owner'
  shopId: string
  calculatedAt: string
  barbers: BarberQueueDto<QueueEntryDto>[]
  /** The barber an "any barber" join would go to; null if none is active. */
  soonestBarberId: string | null
}

export interface PublicShopQueueDto {
  view: 'public'
  shopId: string
  calculatedAt: string
  barbers: BarberQueueDto<PublicQueueEntryDto>[]
  /** The barber an "any barber" join would go to; null if none is active. */
  soonestBarberId: string | null
}

export type ShopQueueDto = OwnerShopQueueDto | PublicShopQueueDto

/** One entry's live status, as its customer sees it. Estimates are null once finished. */
export interface QueueEntryStatusDto {
  id: string
  shopId: string
  barberId: string
  status: QueueEntryStatus
  serviceName: string
  durationMinutes: number
  joinedAt: string
  startedAt: string | null
  endedAt: string | null
  position: number | null
  customersAhead: number | null
  estimatedStart: string | null
  estimatedEnd: string | null
  waitMinutes: number | null
  calculatedAt: string
}

export interface JoinQueueResultDto {
  /** Secret for the customer's tracking link. Only returned here. */
  trackingCode: string
  entry: QueueEntryStatusDto
}

/** The customer's status page. `state` decides the visual treatment. */
export interface QueueTrackingDto extends QueueEntryStatusDto {
  state: TrackingState
  customerName: string
  priceMinor: number
  barberName: string
  shop: {
    name: string
    slug: string
    timezone: string
    currency: string
  }
}

/** A notification for an open page to show (browser channel). */
export interface NotificationDto {
  id: number
  type: string
  title: string
  body: string
  createdAt: string
}

export interface NotificationFeedDto {
  notifications: NotificationDto[]
  /** Pass back as `after` to get only newer ones. */
  cursor: number
}
