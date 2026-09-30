import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { useDb } from '../db'
import * as schema from '../db/schema'

// Extra origins allowed to sign in besides BETTER_AUTH_URL, comma-separated.
// Wildcards are supported, e.g. "https://*.ngrok-free.app" for `pnpm tunnel`.
function trustedOrigins(): string[] {
  return (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(useDb(), { provider: 'pg', schema }),
    trustedOrigins: trustedOrigins(),
    emailAndPassword: {
      enabled: true
    }
  })
}

let instance: ReturnType<typeof createAuth> | undefined

export function useAuth() {
  instance ??= createAuth()
  return instance
}
