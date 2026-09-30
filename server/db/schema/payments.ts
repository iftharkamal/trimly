import { sql } from 'drizzle-orm'
import { check, integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { PAYMENT_METHODS } from '../../../shared/constants'
import { queueEntries } from './queue'

export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // One payment per queue entry; shop and currency are reached through the entry.
    queueEntryId: uuid('queue_entry_id')
      .notNull()
      .unique()
      .references(() => queueEntries.id),
    amountMinor: integer('amount_minor').notNull(),
    method: paymentMethod('method').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  table => [check('payments_amount_non_negative', sql`${table.amountMinor} >= 0`)]
)
