import { describe, expect, it } from 'vitest'
import { checkProductionConfig } from './production-config'

const GOOD = {
  DATABASE_URL: 'postgres://app:secret@db.internal:5432/trimly',
  BETTER_AUTH_SECRET: 'k3J9x0Qm2vT8pL5wR1nY6bF4hZ7cA0sD',
  BETTER_AUTH_URL: 'https://trimly.example.com',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_live_key',
  EMAIL_FROM: 'Trimly <no-reply@trimly.example.com>'
}

// No real SMS provider exists yet, so even a complete configuration says phone sign-in is off.
const SMS_OFF = /SMS_PROVIDER is not set/

describe('checkProductionConfig', () => {
  it('passes a complete production configuration (phone sign-in off until an SMS provider exists)', () => {
    const { errors, warnings } = checkProductionConfig(GOOD)
    expect(errors).toEqual([])
    expect(warnings).toEqual([expect.stringMatching(SMS_OFF)])
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
    expect(warnings).toHaveLength(4)
    expect(warnings[0]).toMatch(/https/)
    expect(warnings[1]).toMatch(/\*\.ngrok-free\.app/)
    expect(warnings[1]).not.toMatch(/admin\.example\.com/)
    expect(warnings[2]).toMatch(/"console"/)
    expect(warnings[3]).toMatch(SMS_OFF)
  })

  it('errors on a half-configured or unknown email provider', () => {
    expect(checkProductionConfig({ ...GOOD, RESEND_API_KEY: undefined }).errors).toEqual(['EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM.'])
    expect(checkProductionConfig({ ...GOOD, EMAIL_FROM: undefined }).errors).toHaveLength(1)
    expect(checkProductionConfig({ ...GOOD, EMAIL_PROVIDER: 'sendgird' }).errors[0]).toMatch(/unknown/)
  })

  it('warns when sending from Resend\'s test address', () => {
    const { errors, warnings } = checkProductionConfig({ ...GOOD, EMAIL_FROM: 'Trimly <onboarding@resend.dev>' })
    expect(errors).toEqual([])
    expect(warnings[0]).toMatch(/test address/)
  })

  it('refuses the development code sender, and unknown SMS providers', () => {
    expect(checkProductionConfig({ ...GOOD, SMS_PROVIDER: 'console' }).errors[0]).toMatch(/development code sender/)
    expect(checkProductionConfig({ ...GOOD, SMS_PROVIDER: 'file' }).errors[0]).toMatch(/development code sender/)
    expect(checkProductionConfig({ ...GOOD, SMS_PROVIDER: 'pigeon' }).errors[0]).toMatch(/unknown/)
  })

  it('accepts exact trusted origins', () => {
    const { warnings } = checkProductionConfig({ ...GOOD, BETTER_AUTH_TRUSTED_ORIGINS: 'https://admin.example.com' })
    expect(warnings).toEqual([expect.stringMatching(SMS_OFF)])
  })
})
