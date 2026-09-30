import { sql } from 'drizzle-orm'
import { check, index, pgTable, smallint, time, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { shops } from './shops'

// Weekly opening hours. A day can have several ranges (e.g. a lunch break);
// a weekday with no rows is closed. Times are local to the shop's timezone.
export const shopHours = pgTable(
  'shop_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    // ISO weekday: 1 = Monday … 7 = Sunday.
    weekday: smallint('weekday').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
    ...timestamps
  },
  table => [
    index('shop_hours_shop_weekday_idx').on(table.shopId, table.weekday),
    check('shop_hours_weekday_range', sql`${table.weekday} between 1 and 7`),
    check('shop_hours_opens_before_closes', sql`${table.opensAt} < ${table.closesAt}`)
  ]
)
