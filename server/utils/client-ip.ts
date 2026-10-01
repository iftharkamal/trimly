import type { H3Event } from 'h3'

/**
 * The client's IP address, for per-client rate limits.
 *
 * Without TRUST_PROXY it's the socket address. With TRUST_PROXY=true (one
 * reverse proxy in front: Nginx, Caddy, ngrok, a load balancer) it's the last
 * X-Forwarded-For entry, the one our proxy appended. Earlier entries come
 * from the client and can be anything, so they are never used.
 */
export function clientIp(event: H3Event): string | undefined {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = event.headers.get('x-forwarded-for')
    const last = forwarded?.split(',').map(part => part.trim()).filter(Boolean).at(-1)
    if (last) {
      return last
    }
  }
  return getRequestIP(event)
}
