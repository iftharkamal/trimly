// Which sites may send state-changing requests to the API. Shared by Better
// Auth (trustedOrigins) and our own origin check (server/middleware/origin-check.ts).

/** Extra trusted origins from BETTER_AUTH_TRUSTED_ORIGINS, comma-separated; `*` is a wildcard. */
export function configuredTrustedOrigins(): string[] {
  return (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `https://*.ngrok-free.app` matches `https://abc.ngrok-free.app`; no wildcard means exact. */
export function originMatches(origin: string, pattern: string): boolean {
  const normalized = origin.toLowerCase()
  if (!pattern.includes('*')) {
    return normalized === pattern.toLowerCase()
  }
  const regex = new RegExp(`^${pattern.toLowerCase().split('*').map(escapeRegExp).join('[a-z0-9.-]+')}$`)
  return regex.test(normalized)
}

/**
 * Whether a state-changing request may proceed, given its Origin header.
 *
 * Browsers send Origin on every cross-site request and on same-origin
 * non-GET requests, and pages can't forge it. So:
 * - no Origin: not a browser (curl, a server), which can't carry a
 *   visitor's cookies; allowed, auth still applies;
 * - Origin of this host (the Host header), or the app URL, or a trusted
 *   origin: allowed;
 * - anything else, including "null" (sandboxed frames): refused.
 */
export function isAllowedRequestOrigin(
  origin: string | null | undefined,
  { host, allowedOrigins }: { host: string | null | undefined, allowedOrigins: string[] }
): boolean {
  if (origin === undefined || origin === null || origin === '') {
    return true
  }

  let url: URL
  try {
    url = new URL(origin)
  }
  catch {
    return false
  }
  if (url.origin === 'null') {
    return false
  }

  if (host && url.host.toLowerCase() === host.toLowerCase()) {
    return true
  }
  return allowedOrigins.some(pattern => originMatches(url.origin, pattern))
}
