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
   Never the ngrok wildcards from development: they trust every site hosted on ngrok.
5. **Client IP (rate limits).** Sign-in, sign-up, password reset and the public join/booking
   limits are all per client IP.
   - App reached directly: `TRUST_PROXY=false`.
   - Exactly one reverse proxy in front (Nginx, Caddy, a load balancer) that appends
     `X-Forwarded-For` (Nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`):
     `TRUST_PROXY=true`. The last entry is used; entries the client sent are ignored.
   - More than one proxy (e.g. Cloudflare → Nginx): not supported yet. Every client would share
     the outer proxy's address, and so one set of limits.
6. **Email.** `EMAIL_PROVIDER` must be a real provider, or new users can't verify their email
   and nobody can reset a password. Only `console` and `file` exist today.

## What's limited, and where it's stored

| Limit | Storage |
|---|---|
| Better Auth: sign-in/sign-up 3 per 10 s, reset/verification emails 3 per minute, per IP | `rate_limit` table (Better Auth prunes it) |
| Public joins and bookings, per shop: 10 per 15 min per IP, 5 per hour per phone | `request_limits` table (pruned hourly by the `maintenance:prune-request-limits` task) |

Both live in PostgreSQL, so limits survive restarts and are shared by every server instance.
