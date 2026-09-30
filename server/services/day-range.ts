import { sql, type SQL } from 'drizzle-orm'

/** A span of absolute time for SQL comparisons: [start, end). */
export interface TimeRange {
  start: SQL
  end: SQL
}

/** Local midnight of a "YYYY-MM-DD" date in `timezone`, as an absolute timestamp. */
function localMidnight(date: string, timezone: string): SQL {
  return sql`(${date}::date::timestamp at time zone ${timezone})`
}

/** Local dates [startDate, endDate) in `timezone`, as absolute timestamps. */
export function localDateRange(timezone: string, startDate: string, endDate: string): TimeRange {
  return { start: localMidnight(startDate, timezone), end: localMidnight(endDate, timezone) }
}

/**
 * The calendar day containing `now` in `timezone`, as absolute timestamps for
 * SQL comparisons: [start, end). Used for "today" numbers in shop time.
 */
export function localDayRange(timezone: string, now: Date): TimeRange {
  const start = sql`(date_trunc('day', ${now.toISOString()}::timestamptz at time zone ${timezone}) at time zone ${timezone})`
  return { start, end: sql`(${start} + interval '1 day')` }
}
