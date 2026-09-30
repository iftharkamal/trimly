// Public online booking responses (dates are ISO strings; local dates "YYYY-MM-DD").
import type { AppointmentStatus } from '../constants'

export interface AvailabilityDto {
  timeZone: string
  /** Today and the following days of the booking window. */
  days: {
    date: string
    /** Has opening hours that day (may still have no free slots). */
    isOpen: boolean
    slots: { startsAt: string }[]
  }[]
}

/** The customer's booking page. */
export interface BookingDto {
  status: AppointmentStatus
  startsAt: string
  endsAt: string
  serviceName: string
  durationMinutes: number
  priceMinor: number
  barberName: string
  customerName: string
  shop: {
    name: string
    slug: string
    timezone: string
    currency: string
  }
  /** Once checked in: the code for the live queue status page (/queue/:code). */
  queueTrackingCode: string | null
  /** Booked and not started yet. */
  canCancel: boolean
}

export interface OnlineBookingResultDto {
  /** Secret for the booking link (/booking/:code). Only returned here. */
  trackingCode: string
  booking: BookingDto
}
