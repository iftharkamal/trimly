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

// Queue positions and ETAs are never stored: they are derived from
// (status, joined_at, id) and service durations at read time.
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
    status: queueEntryStatus('status').notNull().default('waiting'),
    source: queueEntrySource('source').notNull(),
    // Snapshot of the service at join time, so later edits don't change history or ETAs.
    serviceName: text('service_name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    priceMinor: integer('price_minor').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    // Set when the entry reaches completed, cancelled or no_show.
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ...timestamps
  },
  table => [
    // Loading a barber's lane in queue order.
    index('queue_entries_barber_lane_idx').on(table.barberId, table.status, table.joinedAt),
    index('queue_entries_shop_status_idx').on(table.shopId, table.status),
    index('queue_entries_customer_id_idx').on(table.customerId),
    // A barber can serve only one customer at a time.
    uniqueIndex('queue_entries_one_in_service_per_barber')
      .on(table.barberId)
      .where(sql`${table.status} = 'in_service'`),
    // A customer can hold only one active place per shop.
    uniqueIndex('queue_entries_one_active_per_customer_shop')
      .on(table.shopId, table.customerId)
      .where(sql`${table.status} in ('waiting', 'in_service')`),
    check('queue_entries_duration_positive', sql`${table.durationMinutes} > 0`),
    check('queue_entries_price_non_negative', sql`${table.priceMinor} >= 0`)
  ]
)
