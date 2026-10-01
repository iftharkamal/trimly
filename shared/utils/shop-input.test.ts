import { describe, expect, it } from 'vitest'
import { isValidCurrency, isValidTimeZone, suggestSlug } from './shop-input'

describe('suggestSlug', () => {
  it('makes a URL-safe link name from a shop name', () => {
    expect(suggestSlug('Faisal Barber')).toBe('faisal-barber')
    expect(suggestSlug('Faisal\'s Barber Shop!')).toBe('faisals-barber-shop')
    expect(suggestSlug('  Café Crème  ')).toBe('cafe-creme')
  })

  it('stays within 40 characters without a trailing dash', () => {
    const slug = suggestSlug('The Very Long Name Of A Barber Shop In Kochi Kerala')
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('isValidTimeZone and isValidCurrency', () => {
  it('accepts real values only', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(isValidCurrency('INR')).toBe(true)
    expect(isValidCurrency('inr')).toBe(false)
    expect(isValidCurrency('XYZ')).toBe(false)
  })
})
