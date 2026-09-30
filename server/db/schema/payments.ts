import { sql } from 'drizzle-orm'
import { check, index, integer, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../../../shared/constants'
import { timestamps } from './columns'
import { queueEntries } from './queue'

export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES)
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
    // Integer minor units (e.g. paise for INR): exact, no floating point.
    amountMinor: integer('amount_minor').notNull(),
    status: paymentStatus('status').notNull(),
    // Unknown until the customer actually pays.
    method: paymentMethod('method'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    ...timestamps
  },
  table => [
    // Revenue stats filter by payment time.
    index('payments_paid_at_idx').on(table.paidAt),
    check('payments_amount_non_negative', sql`${table.amountMinor} >= 0`),
    // Anything past PENDING has been paid, so it must say how and when.
    check(
      'payments_paid_details',
      sql`${table.status} = 'PENDING' or (${table.method} is not null and ${table.paidAt} is not null)`
    ),
    check(
      'payments_refunded_at',
      sql`(${table.status} = 'REFUNDED') = (${table.refundedAt} is not null)`
    )
  ]
)
