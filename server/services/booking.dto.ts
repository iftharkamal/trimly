import type { AvailabilityDto, BookingDto } from '../../shared/types/booking'
import type { Availability, Booking } from './booking.service'

export function toAvailabilityDto(availability: Availability): AvailabilityDto {
  return {
    timeZone: availability.timeZone,
    days: availability.days.map(day => ({
      date: day.date,
      isOpen: day.isOpen,
      // Which barber gets the slot is decided when booking.
      slots: day.slots.map(slot => ({ startsAt: slot.startsAt.toISOString() }))
    }))
  }
}

export function toBookingDto(booking: Booking): BookingDto {
  const { appointment, shop } = booking
  return {
    status: appointment.status,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    serviceName: appointment.serviceName,
    durationMinutes: appointment.durationMinutes,
    priceMinor: appointment.priceMinor,
    barberName: appointment.barber.name,
    customerName: appointment.customer.name,
    shop: { name: shop.name, slug: shop.slug, timezone: shop.timezone, currency: shop.currency },
    queueTrackingCode: booking.queueTrackingCode,
    canCancel: booking.canCancel
  }
}
