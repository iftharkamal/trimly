import { sql } from 'drizzle-orm'
import { pgEnum, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { MEMBER_ROLES } from '../../../shared/constants'
import { user } from './auth'
import { timestamps } from './columns'
import { shops } from './shops'

export const memberRole = pgEnum('member_role', MEMBER_ROLES)

// Who belongs to a shop, and as what. Identity (the user) belongs to Better
// Auth; this is the business relationship. Read on every request, so a
// removed member or changed role takes effect immediately.
export const shopMembers = pgTable(
  'shop_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    role: memberRole('role').notNull(),
    ...timestamps
  },
  table => [
    unique('shop_members_shop_user_unique').on(table.shopId, table.userId),
    // MVP: a person belongs to one shop. Dropping this allows several (with a shop switcher).
    unique('shop_members_user_id_unique').on(table.userId),
    uniqueIndex('shop_members_one_owner_per_shop').on(table.shopId).where(sql`${table.role} = 'OWNER'`)
  ]
)
