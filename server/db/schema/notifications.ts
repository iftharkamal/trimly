import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { NOTIFICATION_AUDIENCES, NOTIFICATION_TYPES } from '../../../shared/constants'
import { appointments } from './appointments'
import { queueEntries } from './queue'
import { shops } from './shops'

export const notificationAudience = pgEnum('notification_audience', NOTIFICATION_AUDIENCES)
export const notificationType = pgEnum('notification_type', NOTIFICATION_TYPES)

// Every notification sent, once. Channels deliver from here: the browser
// channel is pulled by open pages ("anything after id N?"); push, WhatsApp,
// SMS or email channels can be added without touching the queue.
export const notifications = pgTable(
  'notifications',
  {
    // Increasing, so pages can ask for "anything after N".
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    audience: notificationAudience('audience').notNull(),
    type: notificationType('type').notNull(),
    // The customer's queue entry (CUSTOMER audience), and/or what it's about.
    queueEntryId: uuid('queue_entry_id').references(() => queueEntries.id),
    appointmentId: uuid('appointment_id').references(() => appointments.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Same event, same key: stored (and delivered) only once.
    dedupeKey: text('dedupe_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index('notifications_shop_audience_id_idx').on(table.shopId, table.audience, table.id),
    index('notifications_queue_entry_id_idx').on(table.queueEntryId, table.id)
  ]
)
