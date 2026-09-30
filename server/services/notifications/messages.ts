// Pure: turns a domain event into a notification message. The same message
// can go to any channel (browser now; push, WhatsApp, SMS or email later).
import type { NotificationAudience, NotificationType } from '../../../shared/constants'
import type { DomainEvent } from '../events/types'

export interface NotificationMessage {
  shopId: string
  audience: NotificationAudience
  type: NotificationType
  queueEntryId: string | null
  appointmentId: string | null
  title: string
  body: string
  /** Same event, same key: sent only once. */
  dedupeKey: string
}

/** "Fri 2 Oct, 10:30 AM" in shop time (same time style as the app). */
function when(startsAt: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(startsAt)
  const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone }).format(startsAt)
  return `${day}, ${time}`
}

function minutes(value: number): string {
  return value <= 0 ? 'any moment now' : `about ${value} min`
}

export function toNotificationMessage(event: DomainEvent): NotificationMessage {
  switch (event.type) {
    case 'QUEUE_GETTING_CLOSE':
      return {
        shopId: event.shopId,
        audience: 'CUSTOMER',
        type: event.type,
        queueEntryId: event.entryId,
        appointmentId: null,
        title: `Getting close at ${event.shopName}`,
        body: `You're #${event.position}, ${minutes(event.waitMinutes)} to go. Start heading over.`,
        // Once per place in the queue.
        dedupeKey: `getting-close:${event.entryId}`
      }
    case 'CUSTOMER_JOINED_ONLINE':
      return {
        shopId: event.shopId,
        audience: 'SHOP',
        type: event.type,
        queueEntryId: event.entryId,
        appointmentId: null,
        title: `${event.customerName} joined the queue`,
        body: event.position ? `${event.serviceName} · #${event.position} in line` : event.serviceName,
        dedupeKey: `joined:${event.entryId}`
      }
    case 'CUSTOMER_LEFT_QUEUE':
      return {
        shopId: event.shopId,
        audience: 'SHOP',
        type: event.type,
        queueEntryId: event.entryId,
        appointmentId: null,
        title: `${event.customerName} left the queue`,
        body: 'They cancelled their place online.',
        dedupeKey: `left:${event.entryId}`
      }
    case 'APPOINTMENT_BOOKED_ONLINE':
      return {
        shopId: event.shopId,
        audience: 'SHOP',
        type: event.type,
        queueEntryId: null,
        appointmentId: event.appointmentId,
        title: `New booking: ${event.customerName}`,
        body: `${event.serviceName} · ${when(event.startsAt, event.timeZone)}`,
        dedupeKey: `booked:${event.appointmentId}`
      }
    case 'APPOINTMENT_CANCELLED_BY_CUSTOMER':
      return {
        shopId: event.shopId,
        audience: 'SHOP',
        type: event.type,
        queueEntryId: null,
        appointmentId: event.appointmentId,
        title: `${event.customerName} cancelled`,
        body: `Their booking for ${when(event.startsAt, event.timeZone)} is free again.`,
        dedupeKey: `booking-cancelled:${event.appointmentId}`
      }
  }
}
