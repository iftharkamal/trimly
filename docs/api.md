# Trimly API

All positions, customers-ahead counts and ETAs are calculated by the server on
every request. Clients never send them; request bodies that include them are rejected.

Types for every response are in [`shared/types/queue.ts`](../shared/types/queue.ts);
request schemas are in [`shared/schemas/queue.ts`](../shared/schemas/queue.ts).

## Conventions

**Success** — HTTP 200 (201 when something is created):

```json
{ "data": { } }
```

**Error** — HTTP 4xx/5xx:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [{ "path": "phone", "message": "Enter the phone number with country code, e.g. +91 98765 43210" }]
  }
}
```

`details` is only present for `VALIDATION_ERROR`.

- **Dates** are ISO 8601 strings in UTC. **Money** is integer minor units (paise for INR).
- **Auth** is the Better Auth session cookie (sign in via `/api/auth/*`, by email or phone
  code). Shop access comes from the user's **membership** (`shop_members`): **"owner only"**
  means role `OWNER`; **"member"** means any role (`OWNER` or `BARBER`). The shop is always taken
  from the session's membership, never from the request. See
  [Roles](#roles-and-who-can-do-what).
- **Other websites** can't change anything: a `POST`/`PUT`/`PATCH`/`DELETE` whose `Origin` header
  isn't this app (same host, `BETTER_AUTH_URL`, or `BETTER_AUTH_TRUSTED_ORIGINS`) gets 403
  `FORBIDDEN_ORIGIN`. Requests without `Origin` (not from a browser) are allowed; auth still
  applies. `/api/auth/*` is checked by Better Auth itself.

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST` (e.g. malformed JSON), `PHONE_REQUIRED` |
| 401 | `UNAUTHENTICATED` — no valid session |
| 403 | `FORBIDDEN` — signed in, but not a member of the shop · `INSUFFICIENT_ROLE` — a member whose role can't do this · `ACCOUNT_NOT_VERIFIED` · `FORBIDDEN_ORIGIN` — sent by another website |
| 404 | `SHOP_NOT_FOUND`, `SERVICE_NOT_FOUND`, `BARBER_NOT_FOUND`, `ENTRY_NOT_FOUND` |
| 409 | `SHOP_SELECTION_REQUIRED`, `ALREADY_HAS_SHOP`, `ALREADY_IN_QUEUE`, `BARBER_BUSY`, `INVALID_TRANSITION`, `NO_BARBER_AVAILABLE`, `SHOP_CLOSED`, `SLOT_TAKEN`, `SLOT_UNAVAILABLE`, `ALREADY_BOOKED` |
| 429 | `RATE_LIMITED` — too many public joins or bookings; see `Retry-After` |
| 500 | `INTERNAL_ERROR` |

## `GET /api/shops/:shopId/queue`

The live queue for every barber in the shop.

- **Auth:** none required. A member of this shop gets `view: "owner"` (customer details
  included); everyone else gets `view: "public"` (no names, phones or entry ids).
- **Params:** `shopId` — UUID.

**200 (owner view):**

```json
{
  "data": {
    "view": "owner",
    "shopId": "5b0c…",
    "calculatedAt": "2026-09-30T10:00:00.000Z",
    "barbers": [
      {
        "barber": { "id": "a1f2…", "name": "Faisal", "isActive": true },
        "current": {
          "entry": {
            "id": "e1…", "status": "IN_PROGRESS", "source": "ONLINE",
            "serviceName": "Haircut", "durationMinutes": 20, "priceMinor": 15000,
            "joinedAt": "2026-09-30T09:40:00.000Z", "startedAt": "2026-09-30T09:55:00.000Z",
            "customer": { "id": "c1…", "name": "Arjun", "phone": "+919876543210" }
          },
          "elapsedMinutes": 5,
          "estimatedEnd": "2026-09-30T10:15:00.000Z",
          "isOverrunning": false
        },
        "waiting": [
          {
            "entry": { "id": "e2…", "status": "WAITING", "source": "WALK_IN", "serviceName": "Beard", "…": "…" },
            "position": 1,
            "customersAhead": 1,
            "estimatedStart": "2026-09-30T10:20:00.000Z",
            "estimatedEnd": "2026-09-30T10:30:00.000Z",
            "waitMinutes": 20
          }
        ],
        "nextAvailableAt": "2026-09-30T10:35:00.000Z",
        "joinPreview": {
          "position": 2, "customersAhead": 2,
          "estimatedStart": "2026-09-30T10:35:00.000Z", "waitMinutes": 35
        }
      }
    ],
    "soonestBarberId": "a1f2…"
  }
}
```

- `joinPreview` is what a customer joining that barber **now** could expect (shown before they join).
- `soonestBarberId` is the barber an "any barber" join would be assigned to (`null` if no barber is active).
- `upcoming` lists that barber's booked appointments not yet checked in (next 24 hours, earliest
  first): `{ startsAt, endsAt, serviceName }`, plus `appointmentId` and `customerName` in the
  owner view only. Their time is held in the estimates above.

**200 (public view):** same structure with `"view": "public"`, and each `entry` is only
`{ "serviceName": "Haircut", "durationMinutes": 20 }`.

**Errors:** 400 invalid `shopId` · 404 `SHOP_NOT_FOUND`.

## `POST /api/shops/:shopId/queue`

Add a customer to the queue.

- **Auth:** none required. A public caller creates an **online** join (phone required).
  The owner creates a **walk-in** (phone optional). The source is decided by the server.
- **Params:** `shopId` — UUID.
- **Body** (strict — unknown fields such as `position`, `estimatedStart` or `source` are rejected):

| Field | Type | Notes |
|---|---|---|
| `name` | string | 1–80 characters, trimmed |
| `phone` | string \| null | Optional for walk-ins. International format; spaces, dashes, dots and brackets are removed (`"+91 98765-43210"` → `"+919876543210"`) |
| `serviceId` | UUID | An active service of this shop |
| `barberId` | UUID \| null | Optional. Omit/null for "any barber": the server assigns whoever can start soonest |

```json
{ "name": "Arjun", "phone": "+91 98765 43210", "serviceId": "9d3e…" }
```

**201:**

```json
{
  "data": {
    "trackingCode": "3f0e…",
    "entry": {
      "id": "e3…", "shopId": "5b0c…", "barberId": "a1f2…",
      "status": "WAITING", "serviceName": "Haircut", "durationMinutes": 20,
      "joinedAt": "2026-09-30T10:00:00.000Z", "startedAt": null, "endedAt": null,
      "position": 2, "customersAhead": 2,
      "estimatedStart": "2026-09-30T10:35:00.000Z", "estimatedEnd": "2026-09-30T10:55:00.000Z",
      "waitMinutes": 35, "calculatedAt": "2026-09-30T10:00:00.000Z"
    }
  }
}
```

`trackingCode` is the secret for the customer's tracking link and is only returned here.

**Errors:** 400 `VALIDATION_ERROR` / `BAD_REQUEST` / `PHONE_REQUIRED` · 404 `SHOP_NOT_FOUND` /
`SERVICE_NOT_FOUND` / `BARBER_NOT_FOUND` · 409 `ALREADY_IN_QUEUE` (this phone already has an
active place in this shop) / `NO_BARBER_AVAILABLE` / `SHOP_CLOSED` (online joins only; walk-ins
are still allowed while the shop is closed) · 429 `RATE_LIMITED` (online joins only; see
[Public request limits](#public-request-limits)).

### Public request limits

Online joins and online bookings need no sign-in, so they're limited per shop to stop one
client flooding it. Over a limit the response is 429 `RATE_LIMITED` with a `Retry-After`
header (seconds). Shop owners (walk-ins, dashboard bookings) are not limited.

| Action | Per client IP | Per phone number |
|---|---|---|
| Join the queue online | 10 per 15 min | 5 per hour |
| Book online | 10 per 15 min | 5 per hour |

Every attempt counts, including ones refused for another reason (e.g. `ALREADY_IN_QUEUE`).
Windows are fixed (they start on the clock, e.g. every 15 minutes), and counters are in the
database (`request_limits`), pruned hourly. The per-IP limit is generous on purpose: many
phones share one address on mobile networks and shop Wi-Fi.

## Queue actions

| Endpoint | Transition |
|---|---|
| `POST /api/queue/:id/start` | `WAITING` → `IN_PROGRESS` (any waiting customer, e.g. if #1 is late) |
| `POST /api/queue/:id/complete` | `IN_PROGRESS` → `COMPLETED` (the next customer moves up; not auto-started) |
| `POST /api/queue/:id/cancel` | `WAITING` or `IN_PROGRESS` → `CANCELLED` |
| `POST /api/queue/:id/no-show` | `WAITING` → `NO_SHOW` |

- **Auth:** member (owner or barber). The shop comes from the session; an entry from another shop is `404`.
- **Params:** `id` — queue entry UUID. **Body:** none, except for `complete` (below).
- **200:** the recalculated queue — the same shape as `GET /api/shops/:shopId/queue` (owner view).

### Completing with a payment

`POST /api/queue/:id/complete` takes an optional body recording how the customer paid.
Completing and recording the payment happen in **one transaction**: either both are saved
or neither is. No online payment processing — the barber records what happened at the counter.

```json
{ "payment": { "method": "UPI", "amountMinor": 15000 } }
```

| Field | Type | Notes |
|---|---|---|
| `payment.method` | `"CASH"` | `"UPI"` | `"CARD"` | `"OTHER"` | |
| `payment.amountMinor` | integer | Required, 0 – 10,000,000 (minor units). The dashboard prefills the service price; the barber may change it (discount, tip) |

Send no body, `{}` or `{ "payment": null }` to complete **without** a payment (nothing is
recorded and it doesn't count towards revenue). The body is strict: unknown fields are rejected.
The payment is stored as `PAID` with `paidAt` = now.

**Errors:** 400 invalid `id` · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN` · 404 `ENTRY_NOT_FOUND` ·
409 `INVALID_TRANSITION` (the entry's current status doesn't allow it, including repeated taps) ·
409 `BARBER_BUSY` (start only: the barber already has a customer in progress).

## Customer tracking

The tracking code returned when joining is the credential: whoever has the link can see
that one entry and leave the queue. No account is needed.

### `GET /api/track/:trackingCode`

- **Auth:** none. **Params:** `trackingCode` — UUID.
- **200:** the entry's live status plus what the status page shows. Never includes other customers.

```json
{
  "data": {
    "id": "e3…", "shopId": "5b0c…", "barberId": "a1f2…",
    "status": "WAITING", "state": "GETTING_CLOSE",
    "serviceName": "Haircut", "durationMinutes": 20, "priceMinor": 15000,
    "customerName": "Arjun", "barberName": "Faisal",
    "joinedAt": "2026-09-30T10:00:00.000Z", "startedAt": null, "endedAt": null,
    "position": 2, "customersAhead": 1, "waitMinutes": 15,
    "estimatedStart": "2026-09-30T10:15:00.000Z", "estimatedEnd": "2026-09-30T10:35:00.000Z",
    "calculatedAt": "2026-09-30T10:00:00.000Z",
    "shop": { "name": "Faisal Barber", "slug": "faisal-barber", "timezone": "Asia/Kolkata", "currency": "INR" }
  }
}
```

`state` is decided by the server:

| `state` | When |
|---|---|
| `YOU_ARE_NEXT` | Waiting at position 1 (even if someone is still in the chair) |
| `GETTING_CLOSE` | Waiting, estimated wait ≤ 15 minutes |
| `WAITING` | Waiting, longer than that |
| `IN_PROGRESS` | In the chair |
| `COMPLETED` | Service completed |
| `CANCELLED` | Cancelled, or marked no-show (`status` tells them apart) |

Position and estimates are `null` once the customer is no longer waiting.

**Errors:** 400 invalid code · 404 `ENTRY_NOT_FOUND`.

### `POST /api/track/:trackingCode/cancel`

The customer leaves the queue. Only while `WAITING`; once in the chair, only the barber can
change the entry.

- **Auth:** none. **Body:** none.
- **200:** the updated tracking status (`state: "CANCELLED"`).

**Errors:** 400 invalid code · 404 `ENTRY_NOT_FOUND` · 409 `INVALID_TRANSITION`.

## Accounts and onboarding

One person is one Better Auth `user`, whichever way they sign in: email + password, a code
texted to their phone, or both (a phone added to an email account). Sessions are server-side
(`session` table + httpOnly cookie), last 30 days and are extended when used. Sign out with
`POST /api/auth/sign-out`; `POST /api/auth/revoke-other-sessions` signs out every other device.

These are Better Auth endpoints under `/api/auth/*` (the app calls them through
[`app/utils/auth-client.ts`](../app/utils/auth-client.ts)). Their errors use Better Auth's
shape (`{ "code", "message" }`), not the envelope above.

### Email: sign-up, sign-in, verification, password reset

- **Sign-up** (`POST /api/auth/sign-up/email`) is open to anyone. Passwords need 8+ characters.
  No session is created: a verification link is emailed first.
- **Sign-in** (`POST /api/auth/sign-in/email`) of an unverified account returns 403
  `EMAIL_NOT_VERIFIED` and emails a fresh link. Opening the link verifies the email and signs in.
- **Password reset** (`POST /api/auth/request-password-reset`) always returns 200, whether or not
  the email exists. The link leads to `/reset-password?token=…`; resetting signs out every
  existing session.
- Links are valid for 1 hour.
- **Rate limits** are per client IP (sign-in and sign-up: 3 per 10 s; reset and verification
  emails: 3 per minute; then 429). Counters are in the database (`rate_limit` table), so they
  survive restarts and are shared by every server. The IP is the socket address, or the last
  `X-Forwarded-For` entry when `TRUST_PROXY=true` (exactly one proxy in front; see
  [production.md](production.md)).
- **Email delivery** is set by `EMAIL_PROVIDER`: `resend` (real inboxes; see
  [production.md](production.md#email-with-resend)), `console` (printed in the server log; the
  development default) or `file` (JSON lines in `EMAIL_FILE_PATH`, for tests).
- Sign-up refuses `phoneNumber` in the body (400 `PHONE_NUMBER_NOT_EDITABLE`): a number is only
  ever set by verifying a code.

### Phone: sign-in, sign-up and adding a number (OTP)

1. `POST /api/auth/phone-number/send-otp` `{ "phoneNumber": "+919876543210" }` texts a 6-digit
   code, valid 5 minutes. Numbers must be E.164 and in an allowed country
   (`SMS_ALLOWED_COUNTRY_CODES`, default `+91`), else 400 `INVALID_PHONE_NUMBER`.
2. `POST /api/auth/phone-number/verify` `{ "phoneNumber", "code" }`:
   - the number belongs to an account → signs that account in;
   - it doesn't → **creates** an account (OTP sign-up) and signs it in. Such accounts have no
     email (an internal placeholder Trimly never sends to; `/api/me` reports `email: null`).
     Set the name with `POST /api/auth/update-user` `{ "name" }`.
   - with `"updatePhoneNumber": true` while signed in → adds or changes the number on the
     **current** account instead (400 `PHONE_NUMBER_EXIST` if another account has it).

| Error | When |
|---|---|
| 400 `INVALID_OTP` | wrong code (3 tries per code) |
| 403 `TOO_MANY_ATTEMPTS` | a 4th try on the same code; send a new one |
| 400 `OTP_EXPIRED` | older than 5 minutes |
| 429 `TOO_MANY_CODES` | 3 codes per number per 15 min, 10 per day |
| 429 | 3 code requests or 10 verifications per minute per client IP |
| 503 `PHONE_SIGN_IN_UNAVAILABLE` | no SMS provider configured (production, for now) |

Not offered: phone + password sign-in and password reset by phone (404). `POST /api/auth/update-user`
refuses `phoneNumber` (400 `PHONE_NUMBER_NOT_EDITABLE`).

**Texts** are sent by `SMS_PROVIDER`. Only a development sender exists today (`console`: codes
printed in the server log, the default under `pnpm dev`; `file`: for the API tests). A production
build never uses it, whatever the environment says, so phone sign-in is unavailable in production
until a real provider is added (see [production.md](production.md)).

Every other endpoint that needs a signed-in user requires a verified email **or** phone
(403 `ACCOUNT_NOT_VERIFIED`; both sign-in methods already ensure it).

### Roles and who can do what

People and shops are linked many-to-many by `shop_members` (`id`, `shop_id`, `user_id`, `role`,
timestamps). Nothing about shops is stored on the Better Auth user.

- **Constraints:** a person is in a shop at most once (`unique (shop_id, user_id)`); one `OWNER` per
  shop (partial unique index); foreign keys to `shops` and `user`, deleted with either. Indexed by
  `user_id` (looked up on every request) and by `shop_id` (the unique key leads with it).
- **Creating a shop** makes the creator its `OWNER`, in the same transaction. For now someone who
  already belongs to a shop can't create another (409 `ALREADY_HAS_SHOP`); the check is locked per
  person, so a double-click can't create two.
- `BARBER` and `RECEPTIONIST` members can't be added from the app yet (no invitations).

| Action | OWNER | BARBER | RECEPTIONIST |
|---|---|---|---|
| Queue, walk-ins, start/complete/cancel/no-show, payments | ✓ | ✓ | ✓ |
| Appointments (list, book, check in, cancel, no-show) | ✓ | ✓ | ✓ |
| `GET /api/dashboard`, `GET /api/dashboard/hours`, notifications | ✓ | ✓ | ✓ |
| Open/close the shop (`PATCH /api/dashboard/shop`) | ✓ | 403 `INSUFFICIENT_ROLE` | 403 |
| Services (`/api/dashboard/services*`), `PUT /api/dashboard/hours` | ✓ | 403 `INSUFFICIENT_ROLE` | 403 |
| Reports (`GET /api/reports`) | ✓ | 403 `INSUFFICIENT_ROLE` | 403 |

**Which shop a request is about** (signed-in user → membership → shop):

- Routes with a shop in the URL (`/api/shops/:shopId/…`) use that shop, only after checking the
  user belongs to it.
- Dashboard routes (`/api/dashboard*`, `/api/queue/*`, `/api/reports`) use the user's only shop. A
  person in several shops gets 409 `SHOP_SELECTION_REQUIRED` there: choosing a shop isn't in the
  app yet, and the server never guesses.

Server helpers ([`server/utils/session.ts`](../server/utils/session.ts)): `getCurrentUser`,
`requireUser` (401/403), `requireShopMember` (403 `FORBIDDEN`, 409 when ambiguous), `requireRole`
(403 `INSUFFICIENT_ROLE`), `requireShop` (adds the shop's profile) and `getShopMember` (for public
routes with a member view).

### `GET /api/me`

- **Auth:** signed in.
- **200:** `{ "data": { "user": { "id", "name", "email" | null, "phoneNumber" | null }, "shop": ShopProfile | null, "role": "OWNER" | "BARBER" | "RECEPTIONIST" | null, "memberships": [{ "shop": ShopProfile, "role" }] } }`.
  `memberships` lists every shop the user belongs to. `shop` and `role` are the current shop: the
  only one, or null with none (before onboarding) or with several.

**Errors:** 401 `UNAUTHENTICATED` · 403 `ACCOUNT_NOT_VERIFIED`.

### `POST /api/onboarding/shop`

First-time setup (the `/onboarding/shop` page): create the signed-in user's shop. In one
transaction it creates the shop, makes the user its `OWNER` member, adds the user as its first
barber and sets default opening hours (Mon–Sat 09:00–13:00 and 14:00–20:00, Sunday closed).

- **Auth:** signed in, not yet in any shop.
- **Body** (strict):

```json
{ "name": "Faisal Barber", "phone": "98765 43210", "address": "MG Road, Kochi", "currency": "INR", "timezone": "Asia/Kolkata" }
```

  - `name`: 2–60 characters.
  - `phone`: a 10-digit Indian mobile, or any number with its country code (landlines too); stored
    as E.164.
  - `address`: optional, up to 200 characters.
  - `currency`: ISO 4217.
  - `timezone`: optional IANA zone, sent by the browser; defaults to `Asia/Kolkata`.
  - Not accepted: the owner, the link name or the barber (400): the owner is the session's user,
    the link name (`slug`) is made from the shop name (with a short random suffix if taken), and
    the first barber is the user.
- **201:** the shop profile `{ "id", "name", "slug", "phone", "address", "timezone", "currency", "isOpen" }`.

Repeated or simultaneous submissions create one shop: the rest get 409 `ALREADY_HAS_SHOP` (the
check is locked per user). For now a person who belongs to a shop can't create another.

**Errors:** 400 `VALIDATION_ERROR` (with `details` per field) · 401 · 403 `ACCOUNT_NOT_VERIFIED` ·
409 `ALREADY_HAS_SHOP`.

## Managing services (owner)

Types: `ManagedServiceDto` in [`shared/types/dashboard.ts`](../shared/types/dashboard.ts); schemas in
[`shared/schemas/service.ts`](../shared/schemas/service.ts).

### `GET /api/dashboard/services`

All the shop's services, active first: `[{ "id", "name", "durationMinutes", "priceMinor", "isActive" }]`.

### `POST /api/dashboard/services`

- **Body** (strict): `{ "name" (1–60), "durationMinutes" (5–480), "priceMinor" (0–10,000,000) }`.
- **201:** the new service.

### `PATCH /api/dashboard/services/:id`

- **Body** (strict): any of `name`, `durationMinutes`, `priceMinor`, `isActive` (at least one).
  `isActive: false` archives the service: customers can't choose it, past visits keep it.
- **200:** the updated service.

**Errors (all three):** 400 `VALIDATION_ERROR` · 401 · 403 `FORBIDDEN` · 404 `SERVICE_NOT_FOUND`
(including another shop's service).

## Shops and services

### `GET /api/shops/by-slug/:slug`

The shop behind a `/shop/:slug` link.

- **Auth:** none. **Params:** `slug` — lowercase letters, digits and dashes.
- **200:** `{ "data": { "id", "name", "slug", "timezone", "currency", "isOpen" } }` —
  `isOpen` is whether the shop is taking online customers.

**Errors:** 400 invalid slug · 404 `SHOP_NOT_FOUND`.

### `GET /api/shops/:shopId/services`

- **Auth:** none. **Params:** `shopId` — UUID.
- **200:** active services, cheapest first:
  `{ "data": [{ "id", "name", "durationMinutes", "priceMinor" }] }`.

**Errors:** 400 invalid `shopId` · 404 `SHOP_NOT_FOUND`.

## Barber dashboard

### `GET /api/dashboard`

- **Auth:** member (owner or barber). `member` is who is signed in: `{ "name", "role" }`.
- **200:**

```json
{
  "data": {
    "shop": { "id": "5b0c…", "name": "Faisal Barber", "slug": "faisal-barber", "timezone": "Asia/Kolkata", "currency": "INR", "isOpen": true },
    "member": { "name": "Faisal", "role": "OWNER" },
    "barbers": [{ "id": "a1f2…", "name": "Faisal" }],
    "today": { "customers": 4, "servicesCompleted": 1, "revenueMinor": 15000 }
  }
}
```

"Today" is the current calendar day in the shop's timezone. `customers` counts people who
joined today and weren't cancelled or marked no-show. `revenueMinor` is the total of
`PAID` payments received today (services completed without payment don't count).

**Errors:** 401 `UNAUTHENTICATED` · 403 `FORBIDDEN`.

### `PATCH /api/dashboard/shop`

Open or close the shop to online joins. Walk-ins can always be added.

- **Auth:** owner only.
- **Body** (strict): `{ "isOpen": boolean }`.
- **200:** the updated shop profile (same shape as `GET /api/shops/by-slug/:slug`).

**Errors:** 400 `VALIDATION_ERROR` · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN`.

### `GET /api/reports`

Revenue, customers, services and average bill for a day, week or month, compared with the
previous period, plus a revenue trend.

- **Auth:** owner only.
- **Query** (strict):

| Param | Values | Notes |
|---|---|---|
| `period` | `day` | `week` | `month` | Default `day`. Weeks run Monday–Sunday |
| `date` | `YYYY-MM-DD` | Any date inside the wanted period, in shop time. Default today; future dates are treated as today |

- **200:**

```json
{
  "data": {
    "period": "week",
    "start": "2026-09-28", "end": "2026-10-05",
    "previous": { "start": "2026-09-21", "end": "2026-09-28" },
    "previousDate": "2026-09-21", "nextDate": null,
    "timezone": "Asia/Kolkata", "currency": "INR",
    "totals": { "revenueMinor": 57000, "customers": 4, "services": 5, "payments": 4, "averageBillMinor": 14250 },
    "previousTotals": { "revenueMinor": 50000, "customers": 4, "services": 4, "payments": 4, "averageBillMinor": 12500 },
    "changes": { "revenue": 14, "customers": 0, "services": 25, "averageBill": 14 },
    "trend": { "unit": "day", "buckets": [{ "key": "2026-09-28", "revenueMinor": 0 }, { "key": "2026-09-29", "revenueMinor": 10000 }] }
  }
}
```

- Dates are local calendar dates in the shop's timezone; `end` is exclusive.
- **revenue** = `PAID` payments received in the period · **services** = services completed ·
  **customers** = different customers among them · **averageBill** = revenue ÷ payments
  (`null` when nothing was paid).
- `changes` are whole-number percentages vs the previous period; `null` when the previous
  value is 0 (nothing to compare).
- `trend` buckets: 24 hours (`"00"`–`"23"`) for a day, one per date for a week or month.
- `nextDate` is `null` for the current period.

**Errors:** 400 `VALIDATION_ERROR` · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN`.

## Opening hours

### `GET /api/dashboard/hours` · `PUT /api/dashboard/hours`

Weekly hours for the shop, in shop time. **Auth:** `GET` member; `PUT` owner only.

```json
{ "days": [
  { "weekday": 1, "ranges": [{ "opens": "09:00", "closes": "13:00" }, { "opens": "14:00", "closes": "20:00" }] },
  { "weekday": 7, "ranges": [] }
] }
```

- `weekday`: ISO, 1 = Monday … 7 = Sunday. `PUT` must list all 7 days exactly once and replaces the schedule.
- Each day has 0–2 ranges (0 = closed) in 24-hour `HH:MM`, in order and not overlapping.
- Used for online booking availability. The manual Open/Closed switch still controls online queue joins.

**Errors:** 400 `VALIDATION_ERROR` · 401 · 403.

## Appointments (barber)

A booked appointment **holds its time** in the queue: waiting customers whose service
(plus the buffer) wouldn't finish before it are planned after it, and "join now" estimates
skip it. A late appointment keeps its time until its end. Once checked in, the customer
joins the queue **ordered by their booked time** (ahead of walk-ins who joined after it).

`AppointmentDto`:

```json
{
  "id": "…", "status": "BOOKED", "source": "BARBER", "trackingCode": "…",
  "startsAt": "2026-10-01T05:00:00.000Z", "endsAt": "2026-10-01T05:20:00.000Z",
  "serviceName": "Haircut", "durationMinutes": 20, "priceMinor": 15000,
  "barber": { "id": "…", "name": "Faisal" },
  "customer": { "id": "…", "name": "Arjun", "phone": "+919876543210" },
  "queueEntryId": null, "checkedInAt": null, "endedAt": null, "createdAt": "…"
}
```

`status`: `BOOKED` → `CHECKED_IN` (then the queue entry carries the visit) · `CANCELLED` · `NO_SHOW`.

| Endpoint | Notes |
|---|---|
| `GET /api/dashboard/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD` | Starting on shop dates [from, to), at most 62 days. Earliest first |
| `POST /api/dashboard/appointments` | Body: `{ customer: { name, phone? }, serviceId, barberId?, startsAt }` (`startsAt` ISO with offset). **201** `AppointmentDto` |
| `POST /api/dashboard/appointments/:id/check-in` | Customer arrived → queue entry (`source: "APPOINTMENT"`). **200** recalculated queue (owner view) |
| `POST /api/dashboard/appointments/:id/cancel` | `BOOKED` → `CANCELLED`. **200** `AppointmentDto` |
| `POST /api/dashboard/appointments/:id/no-show` | `BOOKED` → `NO_SHOW`. **200** `AppointmentDto` |

- **Auth:** member (owner or barber). Omit `barberId` for "any barber" (the first free one at that time).
- A barber can't be double-booked: overlapping active appointments are rejected by the
  database, even when two bookings arrive at once. Back-to-back bookings are fine.
- One upcoming (`BOOKED`) appointment per customer per shop.

**Errors:** 400 `VALIDATION_ERROR` / `INVALID_TIME` (not in the future) · 401 · 403 ·
404 `APPOINTMENT_NOT_FOUND` / `SERVICE_NOT_FOUND` / `BARBER_NOT_FOUND` ·
409 `SLOT_TAKEN` / `ALREADY_BOOKED` / `INVALID_TRANSITION` / `ALREADY_IN_QUEUE`.

## Online booking (customers)

Customers book without an account. Offered times:

- start every **15 minutes** from opening, and the whole service must fit inside an opening range;
- need at least **30 minutes' notice**, and run from today up to **14 days** (today + 13);
- keep clear of the barber's other bookings by the shop's buffer. Without `barberId`, a
  time is offered when **any** barber is free; the barber is chosen when booking.

Walk-ins don't limit the offered times: a booking holds its time in the queue and walk-ins
are planned around it. The Open/Closed switch doesn't affect bookings.

### `GET /api/shops/:shopId/availability?serviceId=…[&barberId=…]`

Public. **200:**

```json
{ "data": {
  "timeZone": "Asia/Kolkata",
  "days": [
    { "date": "2026-10-01", "isOpen": true, "slots": [{ "startsAt": "2026-10-01T03:30:00.000Z" }] },
    { "date": "2026-10-04", "isOpen": false, "slots": [] }
  ]
} }
```

**Errors:** 400 · 404 `SHOP_NOT_FOUND` / `SERVICE_NOT_FOUND` / `BARBER_NOT_FOUND`.

### `POST /api/shops/:shopId/appointments`

Public. Books one of the offered times; the server re-checks it, so only offered times can be booked.

```json
{ "customer": { "name": "Arjun", "phone": "+91 98765 43210" }, "serviceId": "…", "barberId": null, "startsAt": "2026-10-01T03:30:00.000Z" }
```

- `phone` is **required** (international format). The body is strict.
- **201:** `{ "trackingCode": "…", "booking": BookingDto }`. `trackingCode` is the secret for
  the booking link `/booking/:trackingCode` and is only returned here.

**Errors:** 400 `VALIDATION_ERROR` · 404 · 409 `SLOT_UNAVAILABLE` (not offered or just taken) /
`SLOT_TAKEN` / `ALREADY_BOOKED` (one upcoming booking per phone number per shop) · 429
`RATE_LIMITED` (see [Public request limits](#public-request-limits)).

### `GET /api/bookings/:trackingCode` · `POST /api/bookings/:trackingCode/cancel`

Public: the code is the credential. `BookingDto`:

```json
{
  "status": "BOOKED", "startsAt": "…", "endsAt": "…",
  "serviceName": "Haircut", "durationMinutes": 20, "priceMinor": 15000,
  "barberName": "Faisal", "customerName": "Arjun",
  "shop": { "name": "Faisal Barber", "slug": "faisal-barber", "timezone": "Asia/Kolkata", "currency": "INR" },
  "queueTrackingCode": null,
  "canCancel": true
}
```

- `canCancel`: booked and not started yet. Cancel returns the updated `BookingDto`.
- `queueTrackingCode`: set once the barber checks the customer in; their live queue status is
  `/queue/:queueTrackingCode`.

**Errors:** 400 invalid code · 404 `APPOINTMENT_NOT_FOUND` · 409 `INVALID_TRANSITION` (cancel
after it started, or not booked).

## Notifications

Business code emits **domain events** (`server/services/events`); it never knows about
notification channels. The notification service (subscribed at startup in
`server/plugins/notifications.ts`) turns each event into a message, stores it **once**
(unique dedupe key) and hands it to every channel in `notifications/channels.ts`.

| Event | Audience | Sent when |
|---|---|---|
| `QUEUE_GETTING_CLOSE` | the customer | their estimated wait is 15 min or less, once per place in the queue |
| `CUSTOMER_JOINED_ONLINE` | the shop | someone joins the queue online |
| `CUSTOMER_LEFT_QUEUE` | the shop | a customer leaves through their tracking link |
| `APPOINTMENT_BOOKED_ONLINE` | the shop | a customer books online |
| `APPOINTMENT_CANCELLED_BY_CUSTOMER` | the shop | a customer cancels through their booking link |

"Getting close" is checked after every queue change and by a scheduled Nitro task every minute
(waits shrink as time passes).

**Channels.** Today: **browser**. Open pages pull their feed with their regular polling and show
new items as a system notification (through `/sw.js`, when the tab is in the background), a toast,
vibration and a beep. Nothing is delivered when the page is closed; add Push, WhatsApp, SMS or
email as channels implementing `NotificationChannel.deliver()`.

### `GET /api/dashboard/notifications?after=N` · `GET /api/track/:trackingCode/notifications?after=N`

Shop feed (members) and one customer's feed (the tracking code is the credential).

```json
{ "data": {
  "notifications": [{ "id": 42, "type": "CUSTOMER_JOINED_ONLINE", "title": "Arjun joined the queue", "body": "Haircut · #3 in line", "createdAt": "…" }],
  "cursor": 42
} }
```

- Without `after`: no items, just the current `cursor`, so a page starts from "now" instead of
  replaying old notifications. Then pass the returned `cursor` as `after`.
- Up to 50 per call, oldest first.

**Errors:** 400 invalid `after` · 401/403 (shop feed) · 404 `ENTRY_NOT_FOUND` (customer feed).

## Tests

`pnpm test:api` builds the app (into `.nuxt-test`, so it can run beside `pnpm dev`), starts it against the `_test` database and calls every
endpoint over HTTP (see [`server/testing/api/`](../server/testing/api/)). Auth emails go to a temporary file,
and the tests follow the emailed links.
