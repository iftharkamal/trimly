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
