import { describe, expect, it } from 'vitest'
import { datesInRange, isValidDate, localDate, percentChange, periodContaining, resolvePeriod } from './periods'

describe('periodContaining', () => {
  it('is the single day for daily reports', () => {
    expect(periodContaining('day', '2026-09-30')).toEqual({ start: '2026-09-30', end: '2026-10-01' })
  })

  it('starts weeks on Monday', () => {
    // 2026-09-30 is a Wednesday.
    expect(periodContaining('week', '2026-09-30')).toEqual({ start: '2026-09-28', end: '2026-10-05' })
    expect(periodContaining('week', '2026-09-28')).toEqual({ start: '2026-09-28', end: '2026-10-05' })
    // Sunday belongs to the week that started the Monday before.
    expect(periodContaining('week', '2026-10-04')).toEqual({ start: '2026-09-28', end: '2026-10-05' })
  })

  it('handles weeks and months across year ends', () => {
    expect(periodContaining('week', '2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-04' })
    expect(periodContaining('month', '2026-12-15')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('covers the whole month, including February in leap years', () => {
    expect(periodContaining('month', '2026-09-30')).toEqual({ start: '2026-09-01', end: '2026-10-01' })
    expect(datesInRange(periodContaining('month', '2028-02-10'))).toHaveLength(29)
    expect(datesInRange(periodContaining('month', '2026-02-10'))).toHaveLength(28)
  })
})

describe('resolvePeriod', () => {
  const today = '2026-09-30'

  it('links to the previous period and hides "next" for the current one', () => {
    expect(resolvePeriod('week', '2026-09-30', today)).toMatchObject({
      start: '2026-09-28',
      previous: { start: '2026-09-21', end: '2026-09-28' },
      previousDate: '2026-09-21',
      nextDate: null
    })
  })

  it('offers "next" for past periods', () => {
    expect(resolvePeriod('day', '2026-09-29', today).nextDate).toBe('2026-09-30')
    expect(resolvePeriod('month', '2026-08-15', today)).toMatchObject({
      start: '2026-08-01',
      previous: { start: '2026-07-01', end: '2026-08-01' },
      nextDate: '2026-09-01'
    })
  })
})

describe('localDate', () => {
  it('uses the shop’s timezone, not UTC', () => {
    // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India.
    expect(localDate('Asia/Kolkata', new Date('2026-09-30T20:00:00Z'))).toBe('2026-10-01')
    expect(localDate('UTC', new Date('2026-09-30T20:00:00Z'))).toBe('2026-09-30')
  })
})

describe('isValidDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDate('2026-09-30')).toBe(true)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('30-09-2026')).toBe(false)
  })
})

describe('percentChange', () => {
  it('rounds the change', () => {
    expect(percentChange(115, 100)).toBe(15)
    expect(percentChange(50, 200)).toBe(-75)
    expect(percentChange(100, 100)).toBe(0)
  })

  it('has nothing to compare against zero or missing values', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(null, 100)).toBeNull()
    expect(percentChange(100, null)).toBeNull()
  })
})
