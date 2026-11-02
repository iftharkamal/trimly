# Trimly

**Queue and appointment management for walk-in barber shops.**

Customers scan the shop's QR code to join the live queue, or book a slot online, then follow their place and estimated wait from their phone. Barbers run the queue from a mobile-first dashboard. Owners manage services, staff, opening hours and revenue.

> **Status:** MVP in active development, not yet deployed. Screenshots below.

<!-- Add screenshots: docs/screenshots/customer-tracking.png, barber-dashboard.png, booking.png, qr-poster.png -->

## Features

- **QR queue join.** Customers need no account. Joining returns an unguessable tracking link that shows their live position and estimated wait.
- **Live ETAs.** Positions and wait times are computed on read from service durations, buffers and upcoming appointments. They are never stored.
- **Online booking.** Slots come from opening hours, and checking in turns a booking into a queue place.
- **Staff roles.** Owner, Barber and Receptionist roles with email verification and phone sign-in (Better Auth).
- **Payments and reports.** Record cash, UPI or card payments, and see day, week and month revenue reports.
- **Printable QR poster** for the shop counter.

## Tech stack

| Layer | Tools |
|---|---|
| App | Nuxt 4, Vue 3, TypeScript (strict) |
| UI | Nuxt UI 4, Tailwind CSS 4 |
| API | Nitro server routes, Zod schemas shared between client and server |
| Data | PostgreSQL, Drizzle ORM (11 migrations) |
| Auth | Better Auth: sessions, email verification, phone OTP, roles |
| Email | Resend (or console/file output in development and tests) |
| Tests | Vitest: unit, integration (real PostgreSQL) and HTTP API |

## Architecture

```
app/            pages, components, composables (customer, barber and owner views)
server/api/     route handlers: validate input with shared Zod schemas, call services
server/services domain logic: queue, appointments, bookings, payments, reports
server/db/      Drizzle schema + SQL migrations
shared/         Zod schemas, types and constants used by client and server
```

The queue-state and availability modules are pure functions that take `now` as input, which keeps them deterministic and easy to test.

## Correctness under concurrency

Two customers booking the same slot, or two devices starting the same customer, must not corrupt the schedule. The rules live in PostgreSQL, not only in application code:

- **No double bookings.** A GiST exclusion constraint rejects overlapping active appointments for the same barber:
  ```sql
  EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status IN ('BOOKED', 'CHECKED_IN'))
  ```
  The booking service inserts directly. On a violation (`23P01`) it tries the next available barber, and returns a `409` ("That time is already booked") when nobody is free.
- **One customer in the chair per barber.** A partial unique index allows at most one `IN_PROGRESS` queue entry per barber.
- **Guarded status changes.** Transitions run as `UPDATE … WHERE status IN (…)`, so a stale request changes nothing.

Integration tests fire simultaneous requests against a real database and assert that exactly one wins.

## Getting started

**Requirements:** Node.js, pnpm, PostgreSQL.

```bash
pnpm install
cp .env.example .env      # set DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
pnpm db:migrate
pnpm db:seed              # demo shop with sample data (local databases only)
pnpm dev                  # http://localhost:3000
```

In development, auth emails and phone sign-in codes are printed in the terminal. To test on a phone, run `pnpm tunnel` and set `NUXT_PUBLIC_SITE_URL` to the tunnel address so QR codes point there.

## Tests

```bash
pnpm test                 # unit tests
pnpm test:integration     # needs TEST_DATABASE_URL (a database name ending in _test)
pnpm test:api             # builds the app and calls endpoints over HTTP
pnpm typecheck
```

Run the integration and API suites separately, because they share the test database.

## Documentation

- [API reference](docs/api.md)
- [Running in production](docs/production.md)

## Roadmap

- SMS provider for phone sign-in in production
- Receptionist invites and a switcher for staff who work in several shops
- Payment gateway (payments are recorded, not processed, today)
- Push notifications when a customer's turn is near
- Public demo deployment

## Author

Built by [Mohammed Ifthar](https://www.linkedin.com/in/mohammed-ifthar-665095308/).
