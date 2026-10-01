// Better Auth handles everything under /api/auth. Its rate limits (sign-in,
// sign-up, password reset) are per client IP, which it can't see through a
// web Request, so we pass it in a header we always set ourselves.
// Behind a reverse proxy (Nginx, Cloudflare, ngrok, …) set TRUST_PROXY=true
// to use the first X-Forwarded-For address; never enable it without a proxy
// that sets that header, or clients could pick their own IP.
export default defineEventHandler((event) => {
  const ip = getRequestIP(event, { xForwardedFor: process.env.TRUST_PROXY === 'true' })

  event.headers.delete(CLIENT_IP_HEADER)
  if (ip) {
    event.headers.set(CLIENT_IP_HEADER, ip)
  }

  return useAuth().handler(toWebRequest(event))
})
