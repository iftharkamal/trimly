// Stores each notification once and hands it to every channel. Listens to
// domain events (wired up in server/plugins/notifications.ts).
import { and, asc, desc, eq, gt } from 'drizzle-orm'
import { useDb } from '../../db'
import { notifications } from '../../db/schema'
import type { DomainEvent } from '../events/types'
import { notificationChannels, type NotificationChannel, type StoredNotification } from './channels'
import { toNotificationMessage } from './messages'

const MAX_PAGE = 50

/**
 * Turns an event into a notification. If it was already sent (same dedupe
 * key), nothing happens. Returns the stored notification, or null if it was a
 * duplicate. A channel that fails is logged and doesn't stop the others.
 */
export async function publishNotification(
  event: DomainEvent,
  channels: readonly NotificationChannel[] = notificationChannels
): Promise<StoredNotification | null> {
  const message = toNotificationMessage(event)

  const [stored] = await useDb()
    .insert(notifications)
    .values(message)
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning()
  if (!stored) {
    return null
  }

  await Promise.all(channels.map(async (channel) => {
    try {
      await channel.deliver(stored)
    }
    catch (error) {
      console.error(`Notification channel "${channel.name}" failed for #${stored.id}:`, error)
    }
  }))
  return stored
}

export interface NotificationPage {
  notifications: StoredNotification[]
  /** Pass back as `after` to get only newer ones. */
  cursor: number
}

async function latestId(where: ReturnType<typeof and>): Promise<number> {
  const [latest] = await useDb()
    .select({ id: notifications.id })
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.id))
    .limit(1)
  return latest?.id ?? 0
}

/**
 * Notifications after a cursor. Without one, returns none and the current
 * cursor, so a freshly opened page starts from "now" instead of replaying old ones.
 */
async function page(where: ReturnType<typeof and>, after: number | undefined): Promise<NotificationPage> {
  if (after === undefined) {
    return { notifications: [], cursor: await latestId(where) }
  }
  const rows = await useDb()
    .select()
    .from(notifications)
    .where(and(where, gt(notifications.id, after)))
    .orderBy(asc(notifications.id))
    .limit(MAX_PAGE)
  return { notifications: rows, cursor: rows.at(-1)?.id ?? after }
}

/** For the barber dashboard. */
export function listShopNotifications(shopId: string, after?: number): Promise<NotificationPage> {
  return page(and(eq(notifications.shopId, shopId), eq(notifications.audience, 'SHOP')), after)
}

/** For one customer's queue status page. */
export function listCustomerNotifications(queueEntryId: string, after?: number): Promise<NotificationPage> {
  return page(and(eq(notifications.queueEntryId, queueEntryId), eq(notifications.audience, 'CUSTOMER')), after)
}
