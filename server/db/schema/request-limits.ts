import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Fixed-window counters for the app's own limits on public requests
// (joining the queue, booking online). Auth limits live in Better Auth's
// rate_limit table. Rows expire and are pruned by a scheduled task.
export const requestLimits = pgTable('request_limits', {
  // e.g. "queue-join:ip:<shopId>:<ip>"
  key: text('key').primaryKey(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
})
