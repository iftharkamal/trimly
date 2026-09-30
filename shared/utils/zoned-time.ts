// Timezone arithmetic without a library. Local dates are "YYYY-MM-DD" and
// local times "HH:MM" in an IANA timezone (the shop's), independent of the
// timezone of whatever device or server runs the code.

const DAY_MS = 86_400_000

/** Minutes the timezone is ahead of UTC at a given instant (e.g. +330 for India). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value)
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return Math.round((wallClockAsUtc - instant.getTime()) / 60_000)
}

/** The instant a local date and time happen in a timezone. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wallClock = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  // Two passes settle the offset around daylight-saving changes.
  let guess = wallClock - offsetMinutes(new Date(wallClock), timeZone) * 60_000
  guess = wallClock - offsetMinutes(new Date(guess), timeZone) * 60_000
  return new Date(guess)
}

/** The local date ("YYYY-MM-DD") of an instant in a timezone. */
export function localDateOf(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

/** The local time ("HH:MM", 24-hour) of an instant in a timezone. */
export function localTimeOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant)
}

/** A local date shifted by whole days. */
export function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!) + days * DAY_MS).toISOString().slice(0, 10)
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return ((new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() + 6) % 7) + 1
}
