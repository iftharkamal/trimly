// Refuses state-changing API requests sent by other websites (CSRF), on top
// of the session cookie being SameSite=Lax. Better Auth checks /api/auth itself.
import type { ApiErrorBody } from '../../shared/types/queue'

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function allowedOrigins(): string[] {
  const origins = configuredTrustedOrigins()
  try {
    origins.push(new URL(process.env.BETTER_AUTH_URL ?? '').origin)
  }
  catch {
    // No app URL configured (development): same-host requests are still allowed.
  }
  return origins
}

export default defineEventHandler((event): ApiErrorBody | undefined => {
  if (!STATE_CHANGING.has(event.method) || !event.path.startsWith('/api/') || event.path.startsWith('/api/auth/')) {
    return
  }

  const allowed = isAllowedRequestOrigin(event.headers.get('origin'), {
    host: event.headers.get('host'),
    allowedOrigins: allowedOrigins()
  })
  if (!allowed) {
    setResponseStatus(event, 403)
    return { error: { code: 'FORBIDDEN_ORIGIN', message: 'Requests from other websites are not allowed' } }
  }
})
