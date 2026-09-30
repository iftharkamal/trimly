// Online booking by customers: offered slots, booking one, and the booking
// link. Combines opening hours, existing bookings and the service duration;
// the slot math itself is pure (availability.ts).
import { BOOKING_NOTICE_MINUTES, BOOKING_WINDOW_DAYS, SLOT_STEP_MINUTES } from '../../shared/constants'
import { addLocalDays, localDateOf, zonedTimeToUtc } from '../../shared/utils/zoned-time'
import {
  cancelByTrackingCode,
  createAppointment,
  getAppointmentByTrackingCode,
  getBusyByBarber,
  type AppointmentView
} from './appointment.service'
import { bookingDates, calculateSlots, isoWeekday, mergeBarberSlots } from './availability'
import { listActiveBarbers } from './barber.service'
import { getActiveService } from './catalog.service'
import type { CustomerInput } from './customer.service'
import { DomainError } from './errors'
import { getTrackingCodeForEntry } from './queue/queue.service'
import { getOpeningHours, getServiceBufferMinutes, getShopProfile, type ShopProfile } from './shop.service'

const MINUTE_MS = 60_000

export interface AvailabilityDay {
  /** Local date, "YYYY-MM-DD". */
  date: string
  isOpen: boolean
  slots: { startsAt: Date, barberIds: string[] }[]
}

export interface Availability {
  timeZone: string
  days: AvailabilityDay[]
}

/**
 * Bookable start times for a service over the booking window (today and the
 * following days), for one barber or, without `barberId`, any barber.
 */
export async function getAvailability(
  shopId: string,
  serviceId: string,
  barberId: string | null,
  now = new Date()
): Promise<Availability> {
  const [shop, service, bufferMinutes, allBarbers, hours] = await Promise.all([
    getShopProfile(shopId),
    getActiveService(shopId, serviceId),
    getServiceBufferMinutes(shopId),
    listActiveBarbers(shopId),
    getOpeningHours(shopId)
  ])

  const barbers = barberId ? allBarbers.filter(barber => barber.id === barberId) : allBarbers
  if (barberId && barbers.length === 0) {
    throw new DomainError('BARBER_NOT_FOUND', 404, 'Barber not found or not available')
  }

  const today = localDateOf(now, shop.timezone)
  const windowStart = zonedTimeToUtc(today, '00:00', shop.timezone)
  const windowEnd = zonedTimeToUtc(addLocalDays(today, BOOKING_WINDOW_DAYS), '00:00', shop.timezone)
  const busyByBarber = await getBusyByBarber(shopId, windowStart, windowEnd)
  const earliestStart = new Date(now.getTime() + BOOKING_NOTICE_MINUTES * MINUTE_MS)

  const days = bookingDates(today, BOOKING_WINDOW_DAYS).map((date): AvailabilityDay => {
    const ranges = hours.days.find(day => day.weekday === isoWeekday(date))?.ranges ?? []
    const perBarber = barbers.map(barber => ({
      barberId: barber.id,
      slots: calculateSlots({
        date,
        timeZone: shop.timezone,
        ranges,
        durationMinutes: service.durationMinutes,
        bufferMinutes,
        busy: busyByBarber.get(barber.id) ?? [],
        earliestStart,
        stepMinutes: SLOT_STEP_MINUTES
      })
    }))
    return { date, isOpen: ranges.length > 0, slots: mergeBarberSlots(perBarber) }
  })

  return { timeZone: shop.timezone, days }
}

export interface OnlineBookingInput {
  shopId: string
  serviceId: string
  barberId: string | null
  customer: CustomerInput
  startsAt: Date
}

/**
 * Books one of the offered slots. The slot is re-checked here, so nothing
 * outside opening hours, the notice period or the window can be booked by
 * calling the API directly.
 */
export async function bookOnline(input: OnlineBookingInput, now = new Date()): Promise<AppointmentView> {
  const availability = await getAvailability(input.shopId, input.serviceId, input.barberId, now)
  const slot = availability.days
    .flatMap(day => day.slots)
    .find(candidate => candidate.startsAt.getTime() === input.startsAt.getTime())

  if (!slot) {
    throw new DomainError('SLOT_UNAVAILABLE', 409, 'That time is no longer available. Please pick another.')
  }

  return createAppointment({
    shopId: input.shopId,
    barberId: input.barberId,
    candidateBarberIds: slot.barberIds,
    customer: input.customer,
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    source: 'ONLINE'
  }, now)
}

/** Everything the customer's booking page shows. */
export interface Booking {
  appointment: AppointmentView
  shop: ShopProfile
  /** Once checked in: the code for their live queue status page. */
  queueTrackingCode: string | null
  canCancel: boolean
}

async function toBooking(appointment: AppointmentView, now: Date): Promise<Booking> {
  const [shop, queueTrackingCode] = await Promise.all([
    getShopProfile(appointment.shopId),
    appointment.queueEntryId ? getTrackingCodeForEntry(appointment.queueEntryId) : Promise.resolve(null)
  ])
  return {
    appointment,
    shop,
    queueTrackingCode,
    canCancel: appointment.status === 'BOOKED' && appointment.startsAt > now
  }
}

export async function getBooking(trackingCode: string, now = new Date()): Promise<Booking> {
  return toBooking(await getAppointmentByTrackingCode(trackingCode), now)
}

export async function cancelBooking(trackingCode: string, now = new Date()): Promise<Booking> {
  return toBooking(await cancelByTrackingCode(trackingCode, now), now)
}
