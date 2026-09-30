// Delivery channels. Each takes a stored notification and sends it its own
// way. Adding push, WhatsApp, SMS or email means adding a channel here; the
// queue and the notification service stay unchanged.

export interface StoredNotification {
  id: number
  shopId: string
  audience: 'SHOP' | 'CUSTOMER'
  type: string
  queueEntryId: string | null
  appointmentId: string | null
  title: string
  body: string
  createdAt: Date
}

export interface NotificationChannel {
  name: string
  deliver(notification: StoredNotification): Promise<void>
}

/**
 * Browser: open pages pull new notifications from storage with their regular
 * polling and show them (service worker notification, sound, banner). Nothing
 * to push from the server.
 */
export const browserChannel: NotificationChannel = {
  name: 'browser',
  async deliver() {}
}

/** Channels in use. */
export const notificationChannels: NotificationChannel[] = [browserChannel]
