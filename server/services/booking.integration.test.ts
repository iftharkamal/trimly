// Online booking against PostgreSQL with a fixed clock: Wednesday
// 30 Sep 2026, 09:00 in the shop's timezone (Asia/Kolkata, UTC+5:30).
import { beforeEach, describe, expect, it } from 'vitest'
import { localTimeOf, zonedTimeToUtc } from '../../shared/utils/zoned-time'
import { createShopFixture, resetDatabase, type ShopFixture } from '../testing/fixtures'
import { createAppointment } from './appointment.service'
import { bookOnline, cancelBooking, getAvailability, getBooking } from './booking.service'
import { checkInAppointment } from './checkin.service'
import { DomainError, type DomainErrorCode } from './errors'
import { setOpeningHours } from './shop.service'

const NOW = new Date('2026-09-30T03:30:00.000Z')
const TZ = 'Asia/Kolkata'

let shop: ShopFixture

/** A shop-local date and time as an instant. */
function local(date: string, time: string): Date {
  return zonedTimeToUtc(date, time, TZ)
}

function localTimes(slots: { startsAt: Date }[]): string[] {
  return slots.map(slot => localTimeOf(slot.startsAt, TZ))
}

async function expectDomainError(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(DomainError)
  expect((error as DomainError).code).toBe(code)
}

beforeEach(async () => {
  await resetDatabase()
  shop = await createShopFixture({ bufferMinutes: 5 })
  // Mon–Sat 09:00–13:00 and 14:00–20:00; Sunday closed.
  await setOpeningHours(shop.shopId, {
    days: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({
      weekday,
      ranges: weekday === 7 ? [] : [{ opens: '09:00', closes: '13:00' }, { opens: '14:00', closes: '20:00' }]
    }))
  })
})

function bookAt(date: string, time: string, phone = '+919990000300', serviceId = shop.services.haircut) {
  return bookOnline({
    shopId: shop.shopId,
    serviceId,
    barberId: null,
    customer: { name: 'Online', phone },
    startsAt: local(date, time)
  }, NOW)
}

describe('getAvailability', () => {
  it('offers the next 14 days in shop time, closed on Sunday', async () => {
    const availability = await getAvailability(shop.shopId, shop.services.haircut, null, NOW)

    expect(availability.timeZone).toBe(TZ)
    expect(availability.days).toHaveLength(14)
    expect(availability.days[0]?.date).toBe('2026-09-30')
    expect(availability.days[13]?.date).toBe('2026-10-13')
    const sunday = availability.days.find(day => day.date === '2026-10-04')
    expect(sunday).toMatchObject({ isOpen: false, slots: [] })
  })

  it('starts today after the 30-minute notice, and fits around lunch and closing', async () => {
    // Haircut + beard: 30 minutes.
    const availability = await getAvailability(shop.shopId, shop.services.haircutAndBeard, null, NOW)
    const today = localTimes(availability.days[0]!.slots)

    expect(today[0]).toBe('09:30')
    // Must end by 13:00: last morning start 12:30; afternoon starts at 14:00, last at 19:30.
    expect(today).toContain('12:30')
    expect(today).not.toContain('12:45')
    expect(today).not.toContain('13:30')
    expect(today).toContain('14:00')
    expect(today.at(-1)).toBe('19:30')
  })

  it('keeps clear of existing bookings, with the buffer', async () => {
    await createAppointment({
      shopId: shop.shopId,
      barberId: shop.barberId,
      customer: { name: 'Booked', phone: '+919990000301' },
      serviceId: shop.services.haircut,
      startsAt: local('2026-10-01', '10:00'), // 10:00–10:20
      source: 'BARBER'
    }, NOW)

    const availability = await getAvailability(shop.shopId, shop.services.haircut, null, NOW)
    const thursday = localTimes(availability.days.find(day => day.date === '2026-10-01')!.slots)

    // A 20-minute haircut must end by 09:55 or start from 10:25.
    expect(thursday.slice(0, 4)).toEqual(['09:00', '09:15', '09:30', '10:30'])
  })

  it('rejects an unknown service or barber', async () => {
    await expectDomainError(getAvailability(shop.shopId, '00000000-0000-4000-8000-000000000000', null, NOW), 'SERVICE_NOT_FOUND')
    await expectDomainError(getAvailability(shop.shopId, shop.services.haircut, '00000000-0000-4000-8000-000000000000', NOW), 'BARBER_NOT_FOUND')
  })
})

describe('bookOnline', () => {
  it('books an offered slot as an online appointment', async () => {
    const appointment = await bookAt('2026-10-01', '11:00')

    expect(appointment).toMatchObject({ status: 'BOOKED', source: 'ONLINE', serviceName: 'Haircut' })
    expect(appointment.startsAt).toEqual(local('2026-10-01', '11:00'))

    // The slot is no longer offered.
    const availability = await getAvailability(shop.shopId, shop.services.haircut, null, NOW)
    expect(localTimes(availability.days.find(day => day.date === '2026-10-01')!.slots)).not.toContain('11:00')
  })

  it('refuses anything that was not offered', async () => {
    await expectDomainError(bookAt('2026-10-01', '13:15'), 'SLOT_UNAVAILABLE') // lunch
    await expectDomainError(bookAt('2026-10-04', '10:00'), 'SLOT_UNAVAILABLE') // Sunday
    await expectDomainError(bookAt('2026-09-30', '09:15'), 'SLOT_UNAVAILABLE') // less than 30 min notice
    await expectDomainError(bookAt('2026-10-14', '10:00'), 'SLOT_UNAVAILABLE') // beyond 14 days
    await expectDomainError(bookAt('2026-10-01', '10:07'), 'SLOT_UNAVAILABLE') // not on the 15-min grid
  })

  it('refuses a slot someone else just took', async () => {
    await bookAt('2026-10-01', '11:00')
    await expectDomainError(bookAt('2026-10-01', '11:00', '+919990000302'), 'SLOT_UNAVAILABLE')
  })

  it('lets exactly one of two simultaneous bookings for the same slot win', async () => {
    const results = await Promise.allSettled([
      bookAt('2026-10-01', '15:00', '+919990000310'),
      bookAt('2026-10-01', '15:00', '+919990000311')
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(['SLOT_TAKEN', 'SLOT_UNAVAILABLE']).toContain((rejected?.reason as DomainError).code)
  })

  it('allows one upcoming booking per customer', async () => {
    await bookAt('2026-10-01', '11:00')
    await expectDomainError(bookAt('2026-10-02', '11:00'), 'ALREADY_BOOKED')
  })
})

describe('booking link', () => {
  it('shows the booking and lets the customer cancel before it starts', async () => {
    const appointment = await bookAt('2026-10-01', '11:00')

    const booking = await getBooking(appointment.trackingCode, NOW)
    expect(booking).toMatchObject({ canCancel: true, queueTrackingCode: null, shop: { slug: 'test-barber' } })

    const cancelled = await cancelBooking(appointment.trackingCode, NOW)
    expect(cancelled).toMatchObject({ canCancel: false, appointment: { status: 'CANCELLED' } })
    await expectDomainError(cancelBooking(appointment.trackingCode, NOW), 'INVALID_TRANSITION')
  })

  it('cannot be cancelled once the appointment time has come', async () => {
    const appointment = await bookAt('2026-10-01', '11:00')
    const afterStart = local('2026-10-01', '11:05')

    expect((await getBooking(appointment.trackingCode, afterStart)).canCancel).toBe(false)
    await expectDomainError(cancelBooking(appointment.trackingCode, afterStart), 'INVALID_TRANSITION')
  })

  it('links to the live queue status after check-in', async () => {
    const appointment = await bookAt('2026-10-01', '11:00')
    await checkInAppointment(shop.shopId, appointment.id)

    const booking = await getBooking(appointment.trackingCode, NOW)
    expect(booking.appointment.status).toBe('CHECKED_IN')
    expect(booking.queueTrackingCode).toMatch(/^[0-9a-f-]{36}$/)
    expect(booking.canCancel).toBe(false)
  })

  it('hides unknown codes', async () => {
    await expectDomainError(getBooking('00000000-0000-4000-8000-000000000000', NOW), 'APPOINTMENT_NOT_FOUND')
  })
})
