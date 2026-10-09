import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { phoneNumber } from 'better-auth/plugins'
import { useDb } from '../db'
import * as schema from '../db/schema'
import { sendEmailInBackground } from '../services/email/email.service'
import { passwordResetEmail, verificationEmail } from '../services/email/templates'
import { sendSmsInBackground } from '../services/sms/sms.service'
import { claimStaffInvites } from '../services/staff.service'
import { authBeforeHook } from './auth-hooks'
import { isAllowedPhoneNumber, isPlaceholderEmail, otpMessage, placeholderEmailFor } from './phone-identity'
import { configuredTrustedOrigins } from './request-origin'

/**
 * Header carrying the client's IP to Better Auth (for per-client rate limits).
 * Set by our auth route from the connection, overwriting anything a client
 * sent, so it can't be spoofed. See server/api/auth/[...all].ts.
 */
export const CLIENT_IP_HEADER = 'x-trimly-client-ip'

const DAY_SECONDS = 24 * 60 * 60
const OTP_MINUTES = 5

// Never email the internal address of an account created by phone.
function sendAccountEmail(to: string, message: { subject: string, text: string }) {
  if (!isPlaceholderEmail(to)) {
    sendEmailInBackground({ to, ...message })
  }
}

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(useDb(), { provider: 'pg', schema }),
    // Besides BETTER_AUTH_URL; see server/utils/request-origin.ts.
    trustedOrigins: configuredTrustedOrigins(),
    advanced: {
      // Without this, rate limits fall back to one bucket shared by everyone.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] }
    },
    // Server-side sessions (session table + httpOnly cookie). Using the app at
    // least once a month keeps a device signed in.
    session: {
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS
    },
    // Counters in the database (rate_limit table): they survive restarts and
    // are shared by every server. On in development too, which `pnpm tunnel`
    // exposes to the internet. Codes are also limited per number (auth-hooks.ts).
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        '/phone-number/send-otp': { window: 60, max: 3 },
        '/phone-number/verify': { window: 60, max: 10 }
      }
    },
    // Phone sign-in is by code only: no phone + password, no reset by phone.
    disabledPaths: ['/sign-in/phone-number', '/phone-number/request-password-reset', '/phone-number/reset-password'],
    hooks: { before: authBeforeHook },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // No session until the email is verified.
      requireEmailVerification: true,
      // A reset signs out every other device.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendAccountEmail(user.email, passwordResetEmail({ name: user.name, url }))
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in unverified sends a fresh link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        sendAccountEmail(user.email, verificationEmail({ name: user.name, url }))
      }
    },
    plugins: [
      // Sign in or sign up with a code texted to the number. Signed-in users
      // add a number the same way (verify with updatePhoneNumber). Either
      // way the number is proven before it's stored, and it's unique.
      phoneNumber({
        otpLength: 6,
        expiresIn: OTP_MINUTES * 60,
        allowedAttempts: 3,
        phoneNumberValidator: phone => isAllowedPhoneNumber(phone),
        sendOTP: ({ phoneNumber: to, code }) => {
          sendSmsInBackground({ to, text: otpMessage(code, OTP_MINUTES) })
        },
        // A number with no account creates one (OTP sign-up), with an
        // internal placeholder email; the name can be set right after.
        // A verified number may be one an owner added a barber with: link that chair.
        callbackOnVerification: async ({ phoneNumber: verified, user }) => {
          await claimStaffInvites(verified, user.id)
        },
        signUpOnVerification: {
          getTempEmail: placeholderEmailFor,
          getTempName: phone => phone
        }
      })
    ]
  })
}

let instance: ReturnType<typeof createAuth> | undefined

export function useAuth() {
  instance ??= createAuth()
  return instance
}
