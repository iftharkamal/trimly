// Reports: revenue, customers served, services and average bill for a day,
// week or month in the shop's timezone, compared with the previous period.
// Reads through the payment and queue modules; owns no tables.
import type { ReportPeriod } from '../../../shared/constants'
import type { ReportDto, ReportTotalsDto } from '../../../shared/types/report'
import { localDateRange } from '../day-range'
import { getRevenueByBucket, getRevenueSummary } from '../payment.service'
import { getServiceSummary } from '../queue/queue.service'
import { getShopProfile } from '../shop.service'
import { datesInRange, localDate, percentChange, resolvePeriod, type PeriodRange } from './periods'

async function totalsFor(shopId: string, timezone: string, range: PeriodRange): Promise<ReportTotalsDto> {
  const timeRange = localDateRange(timezone, range.start, range.end)
  const [revenue, work] = await Promise.all([
    getRevenueSummary(shopId, timeRange),
    getServiceSummary(shopId, timeRange)
  ])
  return {
    revenueMinor: revenue.revenueMinor,
    customers: work.customers,
    services: work.services,
    payments: revenue.payments,
    averageBillMinor: revenue.payments > 0 ? Math.round(revenue.revenueMinor / revenue.payments) : null
  }
}

/**
 * The report for the period containing `date` (default: today in the shop's
 * timezone). Future dates are treated as today.
 */
export async function getReport(shopId: string, period: ReportPeriod, date?: string, now = new Date()): Promise<ReportDto> {
  const shop = await getShopProfile(shopId)
  const today = localDate(shop.timezone, now)
  const resolved = resolvePeriod(period, date && date < today ? date : today, today)

  const unit = period === 'day' ? 'hour' : 'day'
  const [totals, previousTotals, revenueByBucket] = await Promise.all([
    totalsFor(shopId, shop.timezone, resolved),
    totalsFor(shopId, shop.timezone, resolved.previous),
    getRevenueByBucket(shopId, localDateRange(shop.timezone, resolved.start, resolved.end), shop.timezone, unit)
  ])

  const keys = unit === 'hour'
    ? Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
    : datesInRange(resolved)

  return {
    period,
    start: resolved.start,
    end: resolved.end,
    previous: resolved.previous,
    previousDate: resolved.previousDate,
    nextDate: resolved.nextDate,
    timezone: shop.timezone,
    currency: shop.currency,
    totals,
    previousTotals,
    changes: {
      revenue: percentChange(totals.revenueMinor, previousTotals.revenueMinor),
      customers: percentChange(totals.customers, previousTotals.customers),
      services: percentChange(totals.services, previousTotals.services),
      averageBill: percentChange(totals.averageBillMinor, previousTotals.averageBillMinor)
    },
    trend: {
      unit,
      buckets: keys.map(key => ({ key, revenueMinor: revenueByBucket.get(key) ?? 0 }))
    }
  }
}
