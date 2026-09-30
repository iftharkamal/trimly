// Display formatting only. Times are shown in the shop's timezone so every
// device (and the server render) shows the same shop time.

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso))
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** "Now" when it's the customer's turn, otherwise "~25 min". */
export function formatWait(minutes: number): string {
  return minutes <= 0 ? 'Now' : `~${formatMinutes(minutes)}`
}

export function formatMoney(minor: number, currency: string): string {
  const amount = minor / 100
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2
  }).format(amount)
}

export function greetingFor(date: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat('en', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date))
  if (hour < 12) {
    return 'Good morning'
  }
  return hour < 17 ? 'Good afternoon' : 'Good evening'
}

/** "2:40 – 3:00 PM" in the shop's timezone. */
export function formatTimeRange(startIso: string, endIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone })
    .formatRange(new Date(startIso), new Date(endIso))
}

/** "₹" for INR, "$" for USD, ... */
export function currencySymbol(currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency })
    .formatToParts(0)
    .find(part => part.type === 'currency')?.value ?? currency
}

/** Short money for chart axes: "₹1.5K", "₹12K". */
export function formatMoneyCompact(minor: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(minor / 100)
}

// Report dates are plain local dates ("YYYY-MM-DD"); format them as UTC so no
// timezone can move them to another day.
function calendarDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

/** "Wed, 30 Sep", "28 Sep – 4 Oct 2026", "September 2026". */
export function formatReportPeriod(period: 'day' | 'week' | 'month', start: string, end: string): string {
  if (period === 'day') {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(calendarDate(start))
  }
  if (period === 'month') {
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(calendarDate(start))
  }
  const lastDay = new Date(calendarDate(end).getTime() - 86_400_000)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .formatRange(calendarDate(start), lastDay)
}

/** Chart bucket labels: "6 AM" for hours, "Mon" / "15" for days. */
export function formatBucket(unit: 'hour' | 'day', key: string, style: 'weekday' | 'day' | 'full'): string {
  if (unit === 'hour') {
    const hour = new Date(Date.UTC(2000, 0, 1, Number(key)))
    return new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: 'UTC' }).format(hour)
  }
  const options: Intl.DateTimeFormatOptions = style === 'weekday'
    ? { weekday: 'short' }
    : style === 'day' ? { day: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(calendarDate(key))
}
