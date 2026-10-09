import { describe, expect, it } from 'vitest'
import { formatIndianMobile, toIndianMobileE164 } from './phone-input'

describe('toIndianMobileE164', () => {
  it('accepts the common ways of writing a mobile number', () => {
    for (const input of ['9876543210', '98765 43210', '+91 98765-43210', '919876543210', '09876543210', ' +91 (98765) 43210 ']) {
      expect(toIndianMobileE164(input), input).toBe('+919876543210')
    }
  })

  it('rejects numbers that are not 10-digit Indian mobiles', () => {
    for (const input of ['', '12345', '5876543210', '98765432101', '+14155550100', 'phone']) {
      expect(toIndianMobileE164(input), input).toBeNull()
    }
  })
})

describe('formatIndianMobile', () => {
  it('spaces an Indian number and leaves others alone', () => {
    expect(formatIndianMobile('+919876543210')).toBe('+91 98765 43210')
    expect(formatIndianMobile('+14155550100')).toBe('+14155550100')
  })
})
