import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'
import { shopMembers } from './shop-members'
import { shops } from './shops'

// A barber's chair in the queue: customers are assigned to it. The person
// working it is a shop member (member_id → shop_members → user, role), so a
// barber has no separate login identity. Staff added by the owner start with
// just a name and an invite phone; the chair is linked to the person's
// membership when they verify that number.
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
    // The member working this chair; null until linked (or after their access is removed).
    memberId: uuid('member_id').references(() => shopMembers.id, { onDelete: 'set null' }),
    // E.164 mobile the owner added them with; links the chair when that number is verified.
    invitePhone: text('invite_phone'),
    ...timestamps
  },
  table => [
    index('barbers_shop_id_idx').on(table.shopId),
    // One chair per member.
    uniqueIndex('barbers_member_id_unique').on(table.memberId).where(sql`${table.memberId} is not null`),
    // A number is added to a shop's staff once.
    uniqueIndex('barbers_shop_invite_phone_unique').on(table.shopId, table.invitePhone).where(sql`${table.invitePhone} is not null`),
    index('barbers_invite_phone_idx').on(table.invitePhone).where(sql`${table.invitePhone} is not null`)
  ]
)
