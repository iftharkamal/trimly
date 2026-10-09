import { describe, expect, it } from 'vitest'
import { allowedCountryCodes, isAllowedPhoneNumber, isPlaceholderEmail, placeholderEmailFor } from './phone-identity'

describe('isAllowedPhoneNumber', () => {
  it('accepts E.164 numbers in an allowed country only', () => {
    expect(isAllowedPhoneNumber('+919876543210', ['+91'])).toBe(true)
    expect(isAllowedPhoneNumber('+14155550100', ['+91'])).toBe(false)
    expect(isAllowedPhoneNumber('+14155550100', ['+91', '+1'])).toBe(true)
  })

  it('rejects anything not in E.164, so one number has one spelling', () => {
    expect(isAllowedPhoneNumber('+91 98765 43210', ['+91'])).toBe(false)
    expect(isAllowedPhoneNumber('9876543210', ['+91'])).toBe(false)
    expect(isAllowedPhoneNumber('+91', ['+91'])).toBe(false)
  })
})

describe('allowedCountryCodes', () => {
  it('defaults to India and ignores malformed entries', () => {
    expect(allowedCountryCodes({})).toEqual(['+91'])
    expect(allowedCountryCodes({ SMS_ALLOWED_COUNTRY_CODES: '+91, +971,91,+' })).toEqual(['+91', '+971'])
  })
})

describe('placeholder emails', () => {
  it('are derived from the number on a domain that never receives mail', () => {
    expect(placeholderEmailFor('+919876543210')).toBe('919876543210@phone.trimly.invalid')
    expect(isPlaceholderEmail('919876543210@phone.trimly.invalid')).toBe(true)
    expect(isPlaceholderEmail('919876543210@PHONE.TRIMLY.INVALID')).toBe(true)
    expect(isPlaceholderEmail('barber@example.com')).toBe(false)
    expect(isPlaceholderEmail(null)).toBe(false)
  })
})
