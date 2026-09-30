import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { timestamps } from './columns'

// Customers join without an account and are identified by phone number.
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Stored normalized (E.164) by the customer service.
  phone: text('phone').notNull().unique(),
  ...timestamps
})
