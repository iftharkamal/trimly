// Startup checks for a production server: settings that would leave it broken
// or unsafe. Errors stop the server; warnings are logged.

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

  return { errors, warnings }
}
