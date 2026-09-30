import { sql } from 'drizzle-orm'
import { char, check, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { timestamps } from './columns'

export const shops = pgTable(
  'shops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // MVP: one shop per owner account.
    ownerUserId: text('owner_user_id')
      .notNull()
      .unique()
      .references(() => user.id),
    name: text('name').notNull(),
    // Public URL segment: /s/:slug
    slug: text('slug').notNull().unique(),
    phone: text('phone'),
    address: text('address'),
    // IANA timezone (e.g. "Asia/Kolkata"), used for "today" boundaries in stats.
    timezone: text('timezone').notNull(),
    // ISO 4217 code; all money columns are integer minor units in this currency.
    currency: char('currency', { length: 3 }).notNull(),
    // Gap between one service ending and the next starting (cleanup, payment), used in ETAs.
    serviceBufferMinutes: integer('service_buffer_minutes').notNull().default(5),
    ...timestamps
  },
  table => [check('shops_service_buffer_non_negative', sql`${table.serviceBufferMinutes} >= 0`)]
)
