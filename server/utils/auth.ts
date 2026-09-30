import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { useDb } from '../db'
import * as schema from '../db/schema'

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(useDb(), { provider: 'pg', schema }),
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
