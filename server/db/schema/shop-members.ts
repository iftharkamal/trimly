import { sql } from 'drizzle-orm'
import { index, pgEnum, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { MEMBER_ROLES } from '../../../shared/constants'
import { user } from './auth'
import { timestamps } from './columns'
import { shops } from './shops'

export const memberRole = pgEnum('member_role', MEMBER_ROLES)

// Who belongs to a shop, and as what: users ↔ shops, many to many. Identity
// (the user) belongs to Better Auth; this is the business relationship, so
// nothing about shops is stored on the user. Read on every request, so a
// removed member or changed role takes effect immediately.
export const shopMembers = pgTable(
  'shop_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // A membership means nothing without its shop or its person.
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    ...timestamps
  },
  table => [
    // Once per shop. Also serves "who belongs to this shop" (shop_id leads).
    unique('shop_members_shop_user_unique').on(table.shopId, table.userId),
    // "Which shops does this person belong to", on every authenticated request.
    index('shop_members_user_id_idx').on(table.userId),
    uniqueIndex('shop_members_one_owner_per_shop').on(table.shopId).where(sql`${table.role} = 'OWNER'`)
  ]
)
