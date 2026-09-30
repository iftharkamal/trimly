import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { shops } from './shops'

export const barbers = pgTable(
  'barbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    name: text('name').notNull(),
    // Inactive barbers keep their history but cannot receive new queue entries.
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps
  },
  table => [index('barbers_shop_id_idx').on(table.shopId)]
)
