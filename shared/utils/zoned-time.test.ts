import { describe, expect, it } from 'vitest'
import { addLocalDays, isoWeekday, localDateOf, localTimeOf, zonedTimeToUtc } from './zoned-time'

describe('zonedTimeToUtc', () => {
  it('converts shop time to the exact instant', () => {
    expect(zonedTimeToUtc('2026-10-01', '10:30', 'Asia/Kolkata').toISOString()).toBe('2026-10-01T05:00:00.000Z')
    expect(zonedTimeToUtc('2026-10-01', '00:15', 'Asia/Kolkata').toISOString()).toBe('2026-09-30T18:45:00.000Z')
    expect(zonedTimeToUtc('2026-10-01', '10:30', 'UTC').toISOString()).toBe('2026-10-01T10:30:00.000Z')
  })

  it('handles daylight-saving time', () => {
    // New York: EDT (UTC−4) in July, EST (UTC−5) in December.
    expect(zonedTimeToUtc('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z')
    expect(zonedTimeToUtc('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z')
  })

  it('round-trips with localDateOf and localTimeOf', () => {
    const instant = zonedTimeToUtc('2026-10-04', '19:45', 'Asia/Kolkata')
    expect(localDateOf(instant, 'Asia/Kolkata')).toBe('2026-10-04')
    expect(localTimeOf(instant, 'Asia/Kolkata')).toBe('19:45')
  })
})

describe('localDateOf', () => {
  it('uses the shop’s calendar day, not UTC’s', () => {
    expect(localDateOf(new Date('2026-09-30T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-01')
    expect(localDateOf(new Date('2026-09-30T20:00:00Z'), 'UTC')).toBe('2026-09-30')
  })
})

describe('addLocalDays and isoWeekday', () => {
  it('moves across months and years', () => {
    expect(addLocalDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addLocalDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('numbers weekdays Monday = 1 … Sunday = 7', () => {
    expect(isoWeekday('2026-09-28')).toBe(1)
    expect(isoWeekday('2026-10-04')).toBe(7)
  })
})
