// Startup checks for a production server: settings that would leave it broken
// or unsafe. Errors stop the server; warnings are logged.

import { DEV_SMS_PROVIDERS } from '../services/sms/dev-sms'

type Env = Record<string, string | undefined>

/** Providers that don't deliver email to real inboxes. */
const NON_DELIVERING_EMAIL_PROVIDERS = new Set(['console', 'file'])

export function checkProductionConfig(env: Env): { errors: string[], warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set.')
  }

  const secret = env.BETTER_AUTH_SECRET ?? ''
  if (secret.length < 32) {
    errors.push('BETTER_AUTH_SECRET must be set to a random value of 32+ characters (openssl rand -base64 32).')
  }

  let authUrl: URL | null = null
  try {
    authUrl = new URL(env.BETTER_AUTH_URL ?? '')
  }
  catch {
    errors.push('BETTER_AUTH_URL must be the public URL of the app, e.g. https://trimly.example.com.')
  }
  if (authUrl && authUrl.protocol !== 'https:') {
    warnings.push(`BETTER_AUTH_URL is ${authUrl.origin}: use https so session cookies are only sent over TLS.`)
  }

  const wildcardOrigins = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.includes('*'))
  if (wildcardOrigins.length) {
    warnings.push(`BETTER_AUTH_TRUSTED_ORIGINS has wildcards (${wildcardOrigins.join(', ')}): any site matching them is trusted to call the auth API. List exact origins only.`)
  }

  const emailProvider = env.EMAIL_PROVIDER ?? 'console'
  if (NON_DELIVERING_EMAIL_PROVIDERS.has(emailProvider)) {
    warnings.push(`EMAIL_PROVIDER is "${emailProvider}": verification and password-reset emails are not delivered, so new users cannot verify.`)
  }
  else if (emailProvider === 'resend') {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      errors.push('EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM.')
    }
    else if (/@resend\.dev>?$/i.test(env.EMAIL_FROM.trim())) {
      warnings.push(`EMAIL_FROM is Resend's test address (${env.EMAIL_FROM}): it only delivers to your own Resend account's email. Verify your domain and send from it.`)
    }
  }
  else {
    errors.push(`EMAIL_PROVIDER "${emailProvider}" is unknown. Use resend (or console/file outside production).`)
  }

  // Sign-in codes. No real SMS provider is wired up yet, so production has none.
  const smsProvider = env.SMS_PROVIDER ?? ''
  if (DEV_SMS_PROVIDERS.has(smsProvider)) {
    errors.push(`SMS_PROVIDER=${smsProvider} is the development code sender (it prints sign-in codes) and must never run in production.`)
  }
  else if (!smsProvider) {
    warnings.push('SMS_PROVIDER is not set: signing in with a phone number is unavailable (email sign-in works).')
  }
  else {
    errors.push(`SMS_PROVIDER "${smsProvider}" is unknown.`)
  }

  return { errors, warnings }
}
