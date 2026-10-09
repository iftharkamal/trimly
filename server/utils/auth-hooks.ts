// Checks that run before Better Auth handles a request (hooks.before). They
// close gaps in the phoneNumber plugin's defaults and guard SMS costs.
import { createHash } from 'node:crypto'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { consumeRequestLimit, type RequestLimit } from '../services/request-limit.service'
import { isSmsAvailable } from '../services/sms/sms.service'
import { isAllowedPhoneNumber, isPlaceholderEmail } from './phone-identity'

// Per phone number, on top of Better Auth's per-IP limit.
export const OTP_LIMITS: RequestLimit[] = [
  { max: 3, windowSeconds: 15 * 60 },
  { max: 10, windowSeconds: 24 * 60 * 60 }
]

function phoneKey(phoneNumber: string) {
  return createHash('sha256').update(phoneNumber).digest('base64url')
}

export const authBeforeHook = createAuthMiddleware(async (ctx) => {
  const body = (ctx.body ?? {}) as Record<string, unknown>

  // A phone number is only ever set by proving a code sent to it
  // (/phone-number/verify). The plugin's defaults also accept it here, which
  // would let someone attach another person's number to their own account and
  // receive that person's phone sign-ins.
  if ((ctx.path === '/sign-up/email' || ctx.path === '/update-user') && ('phoneNumber' in body || 'phoneNumberVerified' in body)) {
    throw new APIError('BAD_REQUEST', {
      code: 'PHONE_NUMBER_NOT_EDITABLE',
      message: 'Add or change a phone number by verifying it with a code'
    })
  }

  // Placeholder addresses belong to accounts created by phone; taking one
  // would block that phone number from ever signing up.
  if (ctx.path === '/sign-up/email' && isPlaceholderEmail(typeof body.email === 'string' ? body.email : null)) {
    throw new APIError('BAD_REQUEST', { code: 'INVALID_EMAIL', message: 'Enter a valid email address' })
  }

  if (ctx.path === '/phone-number/send-otp') {
    if (!isSmsAvailable()) {
      throw new APIError('SERVICE_UNAVAILABLE', {
        code: 'PHONE_SIGN_IN_UNAVAILABLE',
        message: 'Signing in with a phone number isn\'t available yet. Use your email.'
      })
    }
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber : ''
    // Invalid numbers are refused by the plugin's validator, without a code.
    if (isAllowedPhoneNumber(phoneNumber)) {
      for (const [index, limit] of OTP_LIMITS.entries()) {
        const { allowed, retryAfterSeconds } = await consumeRequestLimit(`otp:phone:${index}:${phoneKey(phoneNumber)}`, limit)
        if (!allowed) {
          const minutes = Math.ceil(retryAfterSeconds / 60)
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'TOO_MANY_CODES',
            message: `Too many codes sent to this number. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
          })
        }
      }
    }
  }
})
