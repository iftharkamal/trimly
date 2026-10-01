// The seed creates a verified owner with a known password, so it must never
// reach a real database by accident.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

type Env = Record<string, string | undefined>

/** Why seeding must not run against this environment, or null when it's safe. */
export function seedRefusal(env: Env): string | null {
  if (env.NODE_ENV === 'production') {
    return 'NODE_ENV is production.'
  }

  let host: string
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname
  }
  catch {
    return 'DATABASE_URL is missing or not a valid URL.'
  }

  if (!LOCAL_HOSTS.has(host)) {
    if (env.SEED_ALLOW_REMOTE_DB !== 'true') {
      return `the database host "${host}" is not local. Set SEED_ALLOW_REMOTE_DB=true if this really is a development database.`
    }
    if ((env.SEED_OWNER_PASSWORD ?? '').length < 12) {
      return 'a non-local database needs SEED_OWNER_PASSWORD (12+ characters) instead of the default password.'
    }
  }
  return null
}
