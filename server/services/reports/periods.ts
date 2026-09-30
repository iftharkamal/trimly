// Pure calendar arithmetic for report periods. Works on plain local dates
// ("YYYY-MM-DD" in the shop's timezone), so no timezone can shift a day.
// Weeks start on Monday.
import type { ReportPeriod } from '../../../shared/constants'

const DAY_MS = 86_400_000

export interface PeriodRange {
  /** First local date in the period. */
  start: string
  /** First local date after the period (exclusive). */
  end: string
}

export interface ResolvedPeriod extends PeriodRange {
  previous: PeriodRange
  /** A date in the next period, or null if that period hasn't started yet. */
  nextDate: string | null
  /** A date in the previous period. */
  previousDate: string
}

function toUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!))
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(toUtc(date).getTime() + days * DAY_MS))
}

function addMonths(date: string, months: number): string {
  const utc = toUtc(date)
  return toDateString(new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + months, 1)))
}

/** Whether a "YYYY-MM-DD" string is a real calendar date. */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && toDateString(toUtc(date)) === date
}

/** Today's date in a timezone, as "YYYY-MM-DD". */
export function localDate(timeZone: string, now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The period of the given kind that contains `date`. */
export function periodContaining(period: ReportPeriod, date: string): PeriodRange {
  switch (period) {
    case 'day':
      return { start: date, end: addDays(date, 1) }
    case 'week': {
      // getUTCDay: Sunday = 0 … Saturday = 6; Monday-based offset.
      const offset = (toUtc(date).getUTCDay() + 6) % 7
      const start = addDays(date, -offset)
      return { start, end: addDays(start, 7) }
    }
    case 'month': {
      const start = `${date.slice(0, 7)}-01`
      return { start, end: addMonths(start, 1) }
    }
  }
}

/** The period containing `date`, with its previous period and navigation dates. */
export function resolvePeriod(period: ReportPeriod, date: string, today: string): ResolvedPeriod {
  const current = periodContaining(period, date)
  const previous = periodContaining(period, addDays(current.start, -1))
  return {
    ...current,
    previous,
    previousDate: previous.start,
    nextDate: current.end <= today ? current.end : null
  }
}

/** Local dates in [start, end). */
export function datesInRange(range: PeriodRange): string[] {
  const dates: string[] = []
  for (let date = range.start; date < range.end; date = addDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

/** Percent change from `previous` to `current`, rounded; null when there's nothing to compare. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null
  }
  return Math.round(((current - previous) / previous) * 100)
}
