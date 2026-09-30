// Appointments against PostgreSQL: booking rules the database enforces,
// check-in into the queue, and booked time held in walk-in ETAs.
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../db'
import { appointments, barbers, queueEntries } from '../db/schema'
import { createShopFixture, resetDatabase, type ShopFixture } from '../testing/fixtures'
import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  markAppointmentNoShow,
  type CreateAppointmentInput
} from './appointment.service'
import { checkInAppointment } from './checkin.service'
import { DomainError, type DomainErrorCode } from './errors'
import { addCustomer, getActiveQueue, type ShopQueue } from './queue/queue.service'
import { getOpeningHours, setOpeningHours } from './shop.service'

const MINUTE_MS = 60_000

let shop: ShopFixture

beforeEach(async () => {
  await resetDatabase()
  shop = await createShopFixture({ bufferMinutes: 5 })
})

function minutesFromNow(minutes: number): Date {
  // Whole minutes, so stored and expected times compare exactly.
  const now = Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS
  return new Date(now + minutes * MINUTE_MS)
}

function book(overrides: Partial<CreateAppointmentInput> = {}) {
  return createAppointment({
    shopId: shop.shopId,
    barberId: shop.barberId,
    customer: { name: 'Booked', phone: '+919990000100' },
    serviceId: shop.services.haircut,
    startsAt: minutesFromNow(60),
    source: 'BARBER',
    ...overrides
  })
}

async function expectDomainError(promise: Promise<unknown>, code: DomainErrorCode) {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(DomainError)
  expect((error as DomainError).code).toBe(code)
}

function lane(queue: ShopQueue) {
  return queue.barbers.find(item => item.barber.id === shop.barberId)!.state
}

async function walkIn(name: string, serviceId = shop.services.haircut) {
  const { entry } = await addCustomer({
    shopId: shop.shopId,
    customer: { name, phone: null },
    serviceId,
    barberId: shop.barberId,
    source: 'WALK_IN'
  })
  return entry
}

describe('booking', () => {
  it('books with a snapshot of the service and a computed end time', async () => {
    const startsAt = minutesFromNow(60)
    const appointment = await book({ startsAt })

    expect(appointment).toMatchObject({
      status: 'BOOKED',
      source: 'BARBER',
      serviceName: 'Haircut',
      durationMinutes: 20,
      priceMinor: 15000,
      barber: { id: shop.barberId, name: 'Faisal' },
      customer: { name: 'Booked', phone: '+919990000100' },
      queueEntryId: null
    })
    expect(appointment.startsAt).toEqual(startsAt)
    expect(appointment.endsAt.getTime() - startsAt.getTime()).toBe(20 * MINUTE_MS)
  })

  it('only books future times', async () => {
    await expectDomainError(book({ startsAt: minutesFromNow(-5) }), 'INVALID_TIME')
  })

  it('rejects an unknown service or barber', async () => {
    await expectDomainError(book({ serviceId: '00000000-0000-4000-8000-000000000000' }), 'SERVICE_NOT_FOUND')
    await expectDomainError(book({ barberId: '00000000-0000-4000-8000-000000000000' }), 'BARBER_NOT_FOUND')
  })

  it('never double-books a barber, but allows back-to-back bookings', async () => {
    await book({ startsAt: minutesFromNow(60) }) // 60–80

    await expectDomainError(
      book({ startsAt: minutesFromNow(70), customer: { name: 'Overlap', phone: '+919990000101' } }),
      'SLOT_TAKEN'
    )
    // Starts exactly when the first ends.
    const next = await book({ startsAt: minutesFromNow(80), customer: { name: 'Next', phone: '+919990000102' } })
    expect(next.status).toBe('BOOKED')
  })

  it('lets exactly one of two simultaneous bookings for the same time win', async () => {
    const startsAt = minutesFromNow(90)
    const results = await Promise.allSettled([
      book({ startsAt, customer: { name: 'A', phone: '+919990000111' } }),
      book({ startsAt, customer: { name: 'B', phone: '+919990000112' } })
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect((rejected?.reason as DomainError).code).toBe('SLOT_TAKEN')
  })

  it('frees the time when a booking is cancelled', async () => {
    const first = await book()
    await cancelAppointment(shop.shopId, first.id)

    const again = await book({ customer: { name: 'Again', phone: '+919990000120' } })
    expect(again.startsAt).toEqual(first.startsAt)
  })

  it('allows one upcoming booking per customer', async () => {
    await book()
    await expectDomainError(book({ startsAt: minutesFromNow(180) }), 'ALREADY_BOOKED')
  })

  it('"any barber" books the first barber free at that time', async () => {
    const [second] = await useDb().insert(barbers).values({ shopId: shop.shopId, name: 'Second' }).returning({ id: barbers.id })
    await book({ startsAt: minutesFromNow(60) })

    const anyBarber = await book({
      barberId: null,
      startsAt: minutesFromNow(60),
      customer: { name: 'Any', phone: '+919990000130' }
    })
    expect(anyBarber.barber.id).toBe(second!.id)

    await expectDomainError(
      book({ barberId: null, startsAt: minutesFromNow(65), customer: { name: 'Full', phone: '+919990000131' } }),
      'SLOT_TAKEN'
    )
  })
})

describe('cancel and no-show', () => {
  it('only changes a booked appointment', async () => {
    const appointment = await book()

    expect((await markAppointmentNoShow(shop.shopId, appointment.id)).status).toBe('NO_SHOW')
    await expectDomainError(cancelAppointment(shop.shopId, appointment.id), 'INVALID_TRANSITION')
    await expectDomainError(cancelAppointment(shop.shopId, '00000000-0000-4000-8000-000000000000'), 'APPOINTMENT_NOT_FOUND')
  })
})

describe('check-in', () => {
  it('puts the customer in the queue by their booked time', async () => {
    const appointment = await book({ startsAt: minutesFromNow(30) })
    const before = await walkIn('Before') // joined now, before the booked time
    const after = await walkIn('After')
    // Simulate "After" having joined after the booked time.
    await useDb().update(queueEntries).set({ orderAt: minutesFromNow(40) }).where(eq(queueEntries.id, after.id))

    const queue = await checkInAppointment(shop.shopId, appointment.id)

    const stored = await getAppointment(shop.shopId, appointment.id)
    expect(stored.status).toBe('CHECKED_IN')
    expect(stored.checkedInAt).toBeInstanceOf(Date)
    const entry = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, stored.queueEntryId!) })
    expect(entry).toMatchObject({ source: 'APPOINTMENT', status: 'WAITING', serviceName: 'Haircut' })
    expect(entry?.orderAt).toEqual(appointment.startsAt)

    expect(lane(queue).waiting.map(item => item.entry.id)).toEqual([before.id, stored.queueEntryId, after.id])
  })

  it('checks in only once, and never a cancelled appointment', async () => {
    const appointment = await book()
    await checkInAppointment(shop.shopId, appointment.id)
    await expectDomainError(checkInAppointment(shop.shopId, appointment.id), 'INVALID_TRANSITION')

    const cancelled = await book({ startsAt: minutesFromNow(200), customer: { name: 'C', phone: '+919990000140' } })
    await cancelAppointment(shop.shopId, cancelled.id)
    await expectDomainError(checkInAppointment(shop.shopId, cancelled.id), 'INVALID_TRANSITION')

    await expectDomainError(checkInAppointment(shop.shopId, '00000000-0000-4000-8000-000000000000'), 'APPOINTMENT_NOT_FOUND')
  })
})

describe('holding booked time in walk-in ETAs', () => {
  it('plans a walk-in around an upcoming booking, and releases it when cancelled', async () => {
    // Booked 10 minutes from now; a 20-minute haircut can't finish (plus buffer) before it.
    const appointment = await book({ startsAt: minutesFromNow(10) })
    const walker = await walkIn('Walker')

    const held = await getActiveQueue(shop.shopId)
    const heldStart = lane(held).waiting.find(item => item.entry.id === walker.id)!.estimatedStart
    expect(heldStart.getTime()).toBe(appointment.endsAt.getTime() + 5 * MINUTE_MS)

    await cancelAppointment(shop.shopId, appointment.id)

    const released = await getActiveQueue(shop.shopId)
    const releasedItem = lane(released).waiting.find(item => item.entry.id === walker.id)!
    expect(releasedItem.estimatedStart).toEqual(released.calculatedAt)
  })

  it('stops holding once the customer checks in (they are in the queue instead)', async () => {
    const appointment = await book({ startsAt: minutesFromNow(10) })
    await checkInAppointment(shop.shopId, appointment.id)
    const stored = await useDb().query.appointments.findFirst({ where: eq(appointments.id, appointment.id) })

    const queue = await getActiveQueue(shop.shopId)
    // The checked-in customer is waiting and starts now: no hold pushes them back.
    expect(lane(queue).waiting[0]).toMatchObject({ position: 1 })
    expect(lane(queue).waiting[0]!.entry.id).toBe(stored!.queueEntryId)
    expect(lane(queue).waiting[0]!.estimatedStart).toEqual(queue.calculatedAt)
  })
})

describe('opening hours', () => {
  it('starts empty (closed every day) and saves a weekly schedule', async () => {
    expect((await getOpeningHours(shop.shopId)).days.every(day => day.ranges.length === 0)).toBe(true)

    const saved = await setOpeningHours(shop.shopId, {
      days: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({
        weekday,
        ranges: weekday === 7 ? [] : [{ opens: '09:00', closes: '13:00' }, { opens: '14:00', closes: '20:00' }]
      }))
    })

    expect(saved.days[0]).toEqual({ weekday: 1, ranges: [{ opens: '09:00', closes: '13:00' }, { opens: '14:00', closes: '20:00' }] })
    expect(saved.days[6]).toEqual({ weekday: 7, ranges: [] })
  })

  it('replaces the previous schedule', async () => {
    const allDays = (ranges: { opens: string, closes: string }[]) =>
      ({ days: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, ranges })) })

    await setOpeningHours(shop.shopId, allDays([{ opens: '09:00', closes: '18:00' }]))
    const replaced = await setOpeningHours(shop.shopId, allDays([{ opens: '10:00', closes: '16:00' }]))

    expect(replaced.days.every(day => day.ranges.length === 1 && day.ranges[0]!.opens === '10:00')).toBe(true)
  })
})
