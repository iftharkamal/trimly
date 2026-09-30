// Response shape of GET /api/reports. Dates are local "YYYY-MM-DD" in the
// shop's timezone; money is integer minor units.
import type { ReportPeriod } from '../constants'

export interface ReportTotalsDto {
  /** Money received (PAID payments). */
  revenueMinor: number
  /** Different customers whose service was completed. */
  customers: number
  /** Services completed. */
  services: number
  /** Number of payments received. */
  payments: number
  /** Revenue per payment; null when nothing was paid. */
  averageBillMinor: number | null
}

export interface ReportDto {
  period: ReportPeriod
  /** Local dates [start, end). */
  start: string
  end: string
  previous: { start: string, end: string }
  /** A date in the previous period (for ← navigation). */
  previousDate: string
  /** A date in the next period, or null if it hasn't started (→ disabled). */
  nextDate: string | null
  timezone: string
  currency: string
  totals: ReportTotalsDto
  previousTotals: ReportTotalsDto
  /** Percent change vs the previous period; null when there's nothing to compare. */
  changes: {
    revenue: number | null
    customers: number | null
    services: number | null
    averageBill: number | null
  }
  trend: {
    /** Hours ("00"–"23") for a day, dates for a week or month. */
    unit: 'hour' | 'day'
    buckets: { key: string, revenueMinor: number }[]
  }
}
