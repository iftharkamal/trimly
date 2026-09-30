import { describe, expect, it } from 'vitest'
import { bookingDates, calculateSlots, mergeBarberSlots, type SlotOptions } from './availability'

const TZ = 'Asia/Kolkata'
const DATE = '2026-10-02' // a Friday

/** A shop-local time on DATE as an instant. */
function at(time: string, date = DATE): Date {
  const [hour, minute] = time.split(':').map(Number)
  // India is UTC+5:30 with no daylight saving.
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)), hour! - 5, minute! - 30))
}

function times(slots: Date[]): string[] {
  return slots.map(slot => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(slot))
}

function slots(overrides: Partial<SlotOptions> = {}) {
  return times(calculateSlots({
    date: DATE,
    timeZone: TZ,
    ranges: [{ opens: '09:00', closes: '10:00' }],
    durationMinutes: 20,
    bufferMinutes: 5,
    busy: [],
    earliestStart: at('00:00'),
    stepMinutes: 15,
    ...overrides
  }))
}

describe('calculateSlots', () => {
  it('offers every 15 minutes where the whole service fits before closing', () => {
    // A 20-minute haircut must end by 10:00, so the last start is 09:30.
    expect(slots()).toEqual(['09:00', '09:15', '09:30'])
  })

  it('offers nothing on a closed day', () => {
    expect(slots({ ranges: [] })).toEqual([])
  })

  it('respects a lunch break', () => {
    expect(slots({ ranges: [{ opens: '12:00', closes: '12:30' }, { opens: '13:30', closes: '14:00' }] }))
      .toEqual(['12:00', '13:30'])
  })

  it('needs enough notice', () => {
    expect(slots({ earliestStart: at('09:10') })).toEqual(['09:15', '09:30'])
  })

  it('keeps clear of other bookings, including the buffer on both sides', () => {
    // Booked 09:30–09:50: a 20-min service needs to end by 09:25 or start after 09:55.
    expect(slots({
      ranges: [{ opens: '09:00', closes: '11:00' }],
      busy: [{ start: at('09:30'), end: at('09:50') }]
    })).toEqual(['09:00', '10:00', '10:15', '10:30'])
  })

  it('allows back-to-back bookings when there is no buffer', () => {
    // Booked 09:20–09:30: 09:00–09:20 ends as it starts, 09:30 starts as it ends.
    expect(slots({
      ranges: [{ opens: '09:00', closes: '10:00' }],
      bufferMinutes: 0,
      busy: [{ start: at('09:20'), end: at('09:30') }]
    })).toEqual(['09:00', '09:30'])
  })
})

describe('mergeBarberSlots', () => {
  it('lists each time once with every barber free then', () => {
    const merged = mergeBarberSlots([
      { barberId: 'a', slots: [at('09:00'), at('09:30')] },
      { barberId: 'b', slots: [at('09:15'), at('09:30')] }
    ])
    expect(merged.map(slot => [times([slot.startsAt])[0], slot.barberIds])).toEqual([
      ['09:00', ['a']],
      ['09:15', ['b']],
      ['09:30', ['a', 'b']]
    ])
  })
})

describe('bookingDates', () => {
  it('covers today and the next days, 14 in all', () => {
    const dates = bookingDates('2026-09-30', 14)
    expect(dates).toHaveLength(14)
    expect(dates[0]).toBe('2026-09-30')
    expect(dates[13]).toBe('2026-10-13')
  })
})
