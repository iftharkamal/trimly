import { sql } from 'drizzle-orm'
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { APPOINTMENT_STATUSES, BOOKING_SOURCES } from '../../../shared/constants'
import { barbers } from './barbers'
import { timestamps } from './columns'
import { customers } from './customers'
import { queueEntries } from './queue'
import { services } from './services'
import { shops } from './shops'

export const appointmentStatus = pgEnum('appointment_status', APPOINTMENT_STATUSES)
export const bookingSource = pgEnum('booking_source', BOOKING_SOURCES)

// Constraint names, exported so the service layer can map violations to domain errors.
// The overlap rule is an exclusion constraint added by a custom migration
// (Drizzle can't declare exclusion constraints).
export const NO_OVERLAPPING_APPOINTMENTS = 'appointments_no_overlap_per_barber'
export const ONE_BOOKING_PER_CUSTOMER_SHOP = 'appointments_one_booked_per_customer_shop'

export const appointments = pgTable(
  'appointments',
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
    // Unguessable code for the customer's booking link.
    trackingCode: uuid('tracking_code').notNull().unique().defaultRandom(),
    status: appointmentStatus('status').notNull().default('BOOKED'),
    source: bookingSource('source').notNull(),
    // Snapshot of the service at booking time.
    serviceName: text('service_name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    priceMinor: integer('price_minor').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    // startsAt + duration; stored so Postgres can reject overlaps.
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    // Set on check-in: the queue entry that carries the visit from here.
    queueEntryId: uuid('queue_entry_id')
      .unique()
      .references(() => queueEntries.id),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    // Set when CANCELLED or NO_SHOW.
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ...timestamps
  },
  table => [
    index('appointments_barber_starts_idx').on(table.barberId, table.startsAt),
    index('appointments_shop_starts_idx').on(table.shopId, table.startsAt),
    index('appointments_customer_id_idx').on(table.customerId),
    // One upcoming booking per customer per shop (limits spam online).
    uniqueIndex(ONE_BOOKING_PER_CUSTOMER_SHOP)
      .on(table.shopId, table.customerId)
      .where(sql`${table.status} = 'BOOKED'`),
    check('appointments_ends_after_starts', sql`${table.endsAt} > ${table.startsAt}`),
    check('appointments_duration_positive', sql`${table.durationMinutes} > 0`),
    check('appointments_price_non_negative', sql`${table.priceMinor} >= 0`)
  ]
)
