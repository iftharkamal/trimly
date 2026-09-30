import { sql } from 'drizzle-orm'
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { QUEUE_ENTRY_SOURCES, QUEUE_ENTRY_STATUSES } from '../../../shared/constants'
import { barbers } from './barbers'
import { timestamps } from './columns'
import { customers } from './customers'
import { services } from './services'
import { shops } from './shops'

export const queueEntryStatus = pgEnum('queue_entry_status', QUEUE_ENTRY_STATUSES)
export const queueEntrySource = pgEnum('queue_entry_source', QUEUE_ENTRY_SOURCES)

// Constraint names, exported so the service layer can map violations to domain errors.
export const ONE_IN_PROGRESS_PER_BARBER = 'queue_entries_one_in_progress_per_barber'
export const ONE_ACTIVE_PER_CUSTOMER_SHOP = 'queue_entries_one_active_per_customer_shop'

// Queue positions and ETAs are never stored. A barber's queue order is the
// WAITING entries sorted by (joined_at, id); ETAs come from the IN_PROGRESS
// entry's started_at plus the snapshotted durations, computed at read time.
export const queueEntries = pgTable(
  'queue_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    barberId: uuid('barber_id')
      .notNull()
      .references(() => barbers.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    // Unguessable code for the customer's tracking link; possession authorizes view/cancel.
    trackingCode: uuid('tracking_code').notNull().unique().defaultRandom(),
    status: queueEntryStatus('status').notNull().default('WAITING'),
    source: queueEntrySource('source').notNull(),
    // Snapshot of the service at join time, so later edits don't change history or ETAs.
    serviceName: text('service_name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    priceMinor: integer('price_minor').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    // Set when the entry reaches COMPLETED, CANCELLED or NO_SHOW.
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ...timestamps
  },
  table => [
    // Loading a barber's lane in queue order.
    index('queue_entries_barber_lane_idx').on(table.barberId, table.status, table.joinedAt),
    index('queue_entries_shop_status_idx').on(table.shopId, table.status),
    index('queue_entries_customer_id_idx').on(table.customerId),
    // Finding when a barber's last service ended (ETA anchor for an idle barber).
    index('queue_entries_barber_ended_idx').on(table.barberId, table.endedAt),
    // A barber can serve only one customer at a time.
    uniqueIndex(ONE_IN_PROGRESS_PER_BARBER)
      .on(table.barberId)
      .where(sql`${table.status} = 'IN_PROGRESS'`),
    // A customer can hold only one active place per shop.
    uniqueIndex(ONE_ACTIVE_PER_CUSTOMER_SHOP)
      .on(table.shopId, table.customerId)
      .where(sql`${table.status} in ('WAITING', 'IN_PROGRESS')`),
    check('queue_entries_duration_positive', sql`${table.durationMinutes} > 0`),
    check('queue_entries_price_non_negative', sql`${table.priceMinor} >= 0`)
  ]
)
