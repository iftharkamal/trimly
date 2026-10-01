// Better Auth handles everything under /api/auth. Its rate limits (sign-in,
// sign-up, password reset) are per client IP, which it can't see through a
// web Request, so we pass it in a header we always set ourselves.
// See server/utils/client-ip.ts for TRUST_PROXY.
export default defineEventHandler((event) => {
  const ip = clientIp(event)

  event.headers.delete(CLIENT_IP_HEADER)
  if (ip) {
    event.headers.set(CLIENT_IP_HEADER, ip)
  }

  return useAuth().handler(toWebRequest(event))
})
