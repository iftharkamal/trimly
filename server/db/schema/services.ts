import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { shops } from './shops'

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    name: text('name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    priceMinor: integer('price_minor').notNull(),
    // Archived instead of deleted so historical queue entries stay valid.
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  table => [
    index('services_shop_id_idx').on(table.shopId),
    check('services_duration_positive', sql`${table.durationMinutes} > 0`),
    check('services_price_non_negative', sql`${table.priceMinor} >= 0`)
  ]
)
