import type { AppointmentStatus, BookingSource } from '../constants'

export interface AppointmentDto {
  id: string
  status: AppointmentStatus
  source: BookingSource
  /** Secret for the customer's booking link. */
  trackingCode: string
  startsAt: string
  endsAt: string
  serviceName: string
  durationMinutes: number
  priceMinor: number
  barber: { id: string, name: string }
  customer: { id: string, name: string, phone: string | null }
  /** Set once checked in: the queue entry carrying the visit. */
  queueEntryId: string | null
  checkedInAt: string | null
  endedAt: string | null
  createdAt: string
}
