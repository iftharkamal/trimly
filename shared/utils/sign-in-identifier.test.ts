import { describe, expect, it } from 'vitest'
import { looksLikeEmail, parseSignInIdentifier } from './sign-in-identifier'

describe('parseSignInIdentifier', () => {
  it('recognises emails, normalised', () => {
    expect(parseSignInIdentifier('  Faisal@Example.COM ')).toEqual({ kind: 'email', email: 'faisal@example.com' })
  })

  it('recognises Indian mobile numbers, in E.164', () => {
    expect(parseSignInIdentifier('98765 43210')).toEqual({ kind: 'phone', phoneNumber: '+919876543210' })
    expect(parseSignInIdentifier('+91 98765-43210')).toEqual({ kind: 'phone', phoneNumber: '+919876543210' })
  })

  it('rejects anything else', () => {
    for (const input of ['', 'faisal', 'faisal@', '@example.com', '12345', '+14155550100']) {
      expect(parseSignInIdentifier(input), input).toBeNull()
    }
  })
})

describe('looksLikeEmail', () => {
  it('switches to email as soon as there is an "@"', () => {
    expect(looksLikeEmail('faisal@')).toBe(true)
    expect(looksLikeEmail('98765')).toBe(false)
  })
})
