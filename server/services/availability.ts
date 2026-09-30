// Pure slot calculation for online booking: no database, no clock. Times of
// day are shop-local ("HH:MM"); results are exact instants.
import { addLocalDays, isoWeekday, zonedTimeToUtc } from '../../shared/utils/zoned-time'

const MINUTE_MS = 60_000

export interface OpeningRange {
  opens: string
  closes: string
}

export interface BusyInterval {
  start: Date
  end: Date
}

export interface SlotOptions {
  /** Local date, "YYYY-MM-DD". */
  date: string
  timeZone: string
  /** That weekday's opening ranges (empty = closed). */
  ranges: readonly OpeningRange[]
  durationMinutes: number
  /** Gap kept before and after other bookings. */
  bufferMinutes: number
  /** The barber's existing active bookings. */
  busy: readonly BusyInterval[]
  /** Nothing starts before this (now + notice). */
  earliestStart: Date
  stepMinutes: number
}

/**
 * Start times on `date` when one barber could take a new booking: every
 * `stepMinutes` from opening, the whole service inside an opening range, not
 * before `earliestStart`, and clear of other bookings by the buffer.
 */
export function calculateSlots(options: SlotOptions): Date[] {
  const duration = options.durationMinutes * MINUTE_MS
  const buffer = options.bufferMinutes * MINUTE_MS
  const step = options.stepMinutes * MINUTE_MS
  const slots: Date[] = []

  for (const range of options.ranges) {
    const opensAt = zonedTimeToUtc(options.date, range.opens, options.timeZone).getTime()
    const closesAt = zonedTimeToUtc(options.date, range.closes, options.timeZone).getTime()

    for (let start = opensAt; start + duration <= closesAt; start += step) {
      if (start < options.earliestStart.getTime()) {
        continue
      }
      const end = start + duration
      const clashes = options.busy.some(booking =>
        start < booking.end.getTime() + buffer && end + buffer > booking.start.getTime()
      )
      if (!clashes) {
        slots.push(new Date(start))
      }
    }
  }
  return slots
}

export interface BarberSlots {
  barberId: string
  slots: readonly Date[]
}

/** For "any barber": each start time with the barbers free then, in barber order. */
export function mergeBarberSlots(perBarber: readonly BarberSlots[]): { startsAt: Date, barberIds: string[] }[] {
  const byStart = new Map<number, string[]>()
  for (const { barberId, slots } of perBarber) {
    for (const slot of slots) {
      byStart.set(slot.getTime(), [...(byStart.get(slot.getTime()) ?? []), barberId])
    }
  }
  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, barberIds]) => ({ startsAt: new Date(time), barberIds }))
}

/** The bookable local dates: today and the following days, `windowDays` in all. */
export function bookingDates(today: string, windowDays: number): string[] {
  return Array.from({ length: windowDays }, (_, index) => addLocalDays(today, index))
}

export { isoWeekday }
