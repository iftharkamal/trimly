# Running Trimly in production

A production server (`NODE_ENV=production`) checks its settings at startup
([`server/utils/production-config.ts`](../server/utils/production-config.ts)). It **refuses to
start** without `DATABASE_URL`, `BETTER_AUTH_URL` and a `BETTER_AUTH_SECRET` of 32+ characters,
and **logs a warning** for the other problems below.

## Checklist

1. **Database.** Set `DATABASE_URL` and run `pnpm db:migrate` before starting the new version.
   Never run `pnpm db:seed`: it creates a demo owner with a known password, and it refuses to
   run with `NODE_ENV=production` or against a non-local database.
2. **Secret.** `BETTER_AUTH_SECRET` = `openssl rand -base64 32`. Changing it signs everyone out.
3. **Public URL.** `BETTER_AUTH_URL` = the https address people use, e.g.
   `https://trimly.example.com`. Email links are built from it.
4. **Trusted origins.** Leave `BETTER_AUTH_TRUSTED_ORIGINS` empty, or list exact extra origins.
   Never the ngrok wildcards from development: they trust every site hosted on ngrok. The same
   list (plus `BETTER_AUTH_URL` and the request's own host) decides which sites may send
   state-changing API requests; anything else gets 403 `FORBIDDEN_ORIGIN`.
5. **Client IP (rate limits).** Sign-in, sign-up, password reset and the public join/booking
   limits are all per client IP.
   - App reached directly: `TRUST_PROXY=false`.
   - Exactly one reverse proxy in front (Nginx, Caddy, a load balancer) that appends
     `X-Forwarded-For` (Nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`):
     `TRUST_PROXY=true`. The last entry is used; entries the client sent are ignored.
   - More than one proxy (e.g. Cloudflare → Nginx): not supported yet. Every client would share
     the outer proxy's address, and so one set of limits.
6. **Public address.** Set `NUXT_PUBLIC_SITE_URL` to the domain customers use (defaults to
   `BETTER_AUTH_URL`). Shop QR codes and shared links point there. Printed QR posters keep working only
   while that address and the shop's link name stay the same.
7. **Email.** `EMAIL_PROVIDER=resend`, with `RESEND_API_KEY` and `EMAIL_FROM` (the server won't
   start without them). Otherwise new users can't verify their email and nobody can reset a
   password. See [Email with Resend](#email-with-resend).

8. **Phone sign-in.** Needs a real SMS provider, which isn't built yet. Until then leave
   `SMS_PROVIDER` unset: phone sign-in answers 503 and people use email. The development
   sender (`console`/`file`, which prints codes) can't run in a production build: that's
   decided when the app is built, not by environment variables, and the server also refuses to
   start if `SMS_PROVIDER` names it. In India, sending OTP texts needs DLT registration first.

## Email with Resend

1. Sign up at [resend.com](https://resend.com) (free: 3,000 emails/month, 100/day).
2. **API Keys → Create API key** with "Sending access". Put it in `RESEND_API_KEY`.
3. **Testing without a domain:** `EMAIL_FROM="Trimly <onboarding@resend.dev>"`. Resend then only
   delivers to the email address you signed up to Resend with; anything else is refused (the
   server log shows why).
4. **Real users:** **Domains → Add domain** (e.g. `trimly.in`), add the DNS records Resend shows
   at your domain registrar, wait until it says *Verified*, then send from it:
   `EMAIL_FROM="Trimly <no-reply@trimly.in>"`.

Sending happens in the background, so a failed email never slows down or breaks sign-up.
Failures are logged with Resend's reason (e.g. "domain is not verified").

## What's limited, and where it's stored

| Limit | Storage |
|---|---|
| Better Auth: sign-in/sign-up 3 per 10 s, reset/verification emails 3 per minute, per IP | `rate_limit` table (Better Auth prunes it) |
| Public joins and bookings, per shop: 10 per 15 min per IP, 5 per hour per phone | `request_limits` table (pruned hourly by the `maintenance:prune-request-limits` task) |

Both live in PostgreSQL, so limits survive restarts and are shared by every server instance.
