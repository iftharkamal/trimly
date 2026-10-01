import { describe, expect, it } from 'vitest'
import { checkProductionConfig } from './production-config'

const GOOD = {
  DATABASE_URL: 'postgres://app:secret@db.internal:5432/trimly',
  BETTER_AUTH_SECRET: 'k3J9x0Qm2vT8pL5wR1nY6bF4hZ7cA0sD',
  BETTER_AUTH_URL: 'https://trimly.example.com',
  EMAIL_PROVIDER: 'resend'
}

describe('checkProductionConfig', () => {
  it('passes a complete production configuration', () => {
    expect(checkProductionConfig(GOOD)).toEqual({ errors: [], warnings: [] })
  })

  it('errors on a missing database, a missing or short secret, or a missing app URL', () => {
    const { errors } = checkProductionConfig({ ...GOOD, DATABASE_URL: undefined, BETTER_AUTH_SECRET: 'too-short', BETTER_AUTH_URL: undefined })
    expect(errors).toHaveLength(3)
    expect(errors.join(' ')).toMatch(/DATABASE_URL.*BETTER_AUTH_SECRET.*BETTER_AUTH_URL/)
    expect(checkProductionConfig({ ...GOOD, BETTER_AUTH_SECRET: undefined }).errors).toHaveLength(1)
  })

  it('warns about http, wildcard trusted origins and email that is not delivered', () => {
    const { errors, warnings } = checkProductionConfig({
      ...GOOD,
      BETTER_AUTH_URL: 'http://trimly.example.com',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://admin.example.com, https://*.ngrok-free.app',
      EMAIL_PROVIDER: undefined
    })
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toMatch(/https/)
    expect(warnings[1]).toMatch(/\*\.ngrok-free\.app/)
    expect(warnings[1]).not.toMatch(/admin\.example\.com/)
    expect(warnings[2]).toMatch(/"console"/)
  })

  it('accepts exact trusted origins', () => {
    expect(checkProductionConfig({ ...GOOD, BETTER_AUTH_TRUSTED_ORIGINS: 'https://admin.example.com' }).warnings).toEqual([])
  })
})
