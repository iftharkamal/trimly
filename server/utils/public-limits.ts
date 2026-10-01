// Limits on the public, sign-in-free actions that create records: joining the
// queue online and booking online. They stop one client flooding a shop.
// Shop owners (walk-ins, their own bookings) are not limited.
import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { consumeRequestLimit, type RequestLimit } from '../services/request-limit.service'
import { ApiError } from './api'

type PublicAction = 'queue-join' | 'booking'

// Per shop. Per IP is generous because many phones share one address on
// mobile networks (CGNAT) and shop Wi-Fi; per phone number is tighter.
export const PUBLIC_LIMITS: Record<PublicAction, { perIp: RequestLimit, perPhone: RequestLimit }> = {
  'queue-join': { perIp: { max: 10, windowSeconds: 15 * 60 }, perPhone: { max: 5, windowSeconds: 60 * 60 } },
  'booking': { perIp: { max: 10, windowSeconds: 15 * 60 }, perPhone: { max: 5, windowSeconds: 60 * 60 } }
}

// Phone numbers aren't kept in the counters table, only a hash.
function phoneKey(phone: string) {
  return createHash('sha256').update(phone).digest('base64url')
}

/** Counts this request; 429 RATE_LIMITED (with Retry-After) when over a limit. */
export async function enforcePublicLimits(event: H3Event, action: PublicAction, shopId: string, phone: string | null) {
  const limits = PUBLIC_LIMITS[action]
  const checks: { key: string, limit: RequestLimit }[] = [
    { key: `${action}:ip:${shopId}:${clientIp(event) ?? 'unknown'}`, limit: limits.perIp }
  ]
  if (phone) {
    checks.push({ key: `${action}:phone:${shopId}:${phoneKey(phone)}`, limit: limits.perPhone })
  }

  for (const { key, limit } of checks) {
    const { allowed, retryAfterSeconds } = await consumeRequestLimit(key, limit)
    if (!allowed) {
      setResponseHeader(event, 'Retry-After', retryAfterSeconds)
      const minutes = Math.ceil(retryAfterSeconds / 60)
      throw new ApiError('RATE_LIMITED', 429, `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    }
  }
}
