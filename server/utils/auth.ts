import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { useDb } from '../db'
import * as schema from '../db/schema'
import { sendEmailInBackground } from '../services/email/email.service'
import { passwordResetEmail, verificationEmail } from '../services/email/templates'

// Extra origins allowed to sign in besides BETTER_AUTH_URL, comma-separated.
// Wildcards are supported, e.g. "https://*.ngrok-free.app" for `pnpm tunnel`.
function trustedOrigins(): string[] {
  return (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

/**
 * Header carrying the client's IP to Better Auth (for per-client rate limits).
 * Set by our auth route from the connection, overwriting anything a client
 * sent, so it can't be spoofed. See server/api/auth/[...all].ts.
 */
export const CLIENT_IP_HEADER = 'x-trimly-client-ip'

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(useDb(), { provider: 'pg', schema }),
    trustedOrigins: trustedOrigins(),
    advanced: {
      // Without this, rate limits fall back to one bucket shared by everyone.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] }
    },
    // Counters in the database (rate_limit table): they survive restarts and
    // are shared by every server. On in development too, which `pnpm tunnel`
    // exposes to the internet.
    rateLimit: { enabled: true, storage: 'database' },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // No session until the email is verified.
      requireEmailVerification: true,
      // A reset signs out every other device.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendEmailInBackground({ to: user.email, ...passwordResetEmail({ name: user.name, url }) })
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in unverified sends a fresh link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        sendEmailInBackground({ to: user.email, ...verificationEmail({ name: user.name, url }) })
      }
    }
  })
}

let instance: ReturnType<typeof createAuth> | undefined

export function useAuth() {
  instance ??= createAuth()
  return instance
}
