import { describe, expect, it, vi } from 'vitest'
import { emitDomainEvent, onDomainEvent } from '../events/bus'
import { toNotificationMessage } from './messages'

const startsAt = new Date('2026-10-02T05:00:00Z') // Fri 2 Oct, 10:30 in India

describe('toNotificationMessage', () => {
  it('tells a customer their turn is getting close, once per place in the queue', () => {
    expect(toNotificationMessage({
      type: 'QUEUE_GETTING_CLOSE',
      shopId: 'shop',
      shopName: 'Faisal Barber',
      entryId: 'entry-1',
      position: 2,
      waitMinutes: 12
    })).toEqual({
      shopId: 'shop',
      audience: 'CUSTOMER',
      type: 'QUEUE_GETTING_CLOSE',
      queueEntryId: 'entry-1',
      appointmentId: null,
      title: 'Getting close at Faisal Barber',
      body: 'You\'re #2, about 12 min to go. Start heading over.',
      dedupeKey: 'getting-close:entry-1'
    })
  })

  it('says "any moment now" when the wait is zero', () => {
    const message = toNotificationMessage({
      type: 'QUEUE_GETTING_CLOSE',
      shopId: 'shop',
      shopName: 'Faisal Barber',
      entryId: 'entry-1',
      position: 1,
      waitMinutes: 0
    })
    expect(message.body).toBe('You\'re #1, any moment now to go. Start heading over.')
  })

  it('tells the shop about online joins and leavers', () => {
    expect(toNotificationMessage({
      type: 'CUSTOMER_JOINED_ONLINE',
      shopId: 'shop',
      entryId: 'entry-1',
      customerName: 'Arjun',
      serviceName: 'Haircut',
      position: 3
    })).toMatchObject({ audience: 'SHOP', title: 'Arjun joined the queue', body: 'Haircut · #3 in line', dedupeKey: 'joined:entry-1' })

    expect(toNotificationMessage({
      type: 'CUSTOMER_LEFT_QUEUE',
      shopId: 'shop',
      entryId: 'entry-1',
      customerName: 'Arjun'
    })).toMatchObject({ audience: 'SHOP', title: 'Arjun left the queue', dedupeKey: 'left:entry-1' })
  })

  it('tells the shop about bookings and cancellations, in shop time', () => {
    expect(toNotificationMessage({
      type: 'APPOINTMENT_BOOKED_ONLINE',
      shopId: 'shop',
      appointmentId: 'appt-1',
      customerName: 'Nabil',
      serviceName: 'Beard',
      startsAt,
      timeZone: 'Asia/Kolkata'
    })).toMatchObject({
      audience: 'SHOP',
      appointmentId: 'appt-1',
      title: 'New booking: Nabil',
      body: 'Beard · Fri 2 Oct, 10:30 AM',
      dedupeKey: 'booked:appt-1'
    })

    expect(toNotificationMessage({
      type: 'APPOINTMENT_CANCELLED_BY_CUSTOMER',
      shopId: 'shop',
      appointmentId: 'appt-1',
      customerName: 'Nabil',
      startsAt,
      timeZone: 'Asia/Kolkata'
    })).toMatchObject({ title: 'Nabil cancelled', dedupeKey: 'booking-cancelled:appt-1' })
  })
})

describe('domain event bus', () => {
  const event = { type: 'CUSTOMER_LEFT_QUEUE', shopId: 's', entryId: 'e', customerName: 'A' } as const

  it('delivers to every listener, and a failing listener fails nobody', async () => {
    const received = vi.fn()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const offFailing = onDomainEvent(() => {
      throw new Error('provider down')
    })
    const offReceiving = onDomainEvent(received)

    await expect(emitDomainEvent(event)).resolves.toBeUndefined()
    expect(received).toHaveBeenCalledWith(event)
    expect(errors).toHaveBeenCalled()

    offFailing()
    offReceiving()
    errors.mockRestore()
  })

  it('stops delivering after unsubscribing', async () => {
    const received = vi.fn()
    const off = onDomainEvent(received)
    off()

    await emitDomainEvent(event)
    expect(received).not.toHaveBeenCalled()
  })
})
