import { sql, type SQL } from 'drizzle-orm'

/**
 * The calendar day containing `now` in `timezone`, as absolute timestamps for
 * SQL comparisons: [start, end). Used for "today" numbers in shop time.
 */
export function localDayRange(timezone: string, now: Date): { start: SQL, end: SQL } {
  const start = sql`(date_trunc('day', ${now.toISOString()}::timestamptz at time zone ${timezone}) at time zone ${timezone})`
  return { start, end: sql`(${start} + interval '1 day')` }
}
