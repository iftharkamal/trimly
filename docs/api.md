# Trimly API — Queue

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
- **Auth** is the Better Auth session cookie (sign in via `/api/auth/*`). "Owner" means the
  signed-in user owns the shop in question.

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST` (e.g. malformed JSON), `PHONE_REQUIRED` |
| 401 | `UNAUTHENTICATED` — no valid session |
| 403 | `FORBIDDEN` — signed in, but the account doesn't manage a shop |
| 404 | `SHOP_NOT_FOUND`, `SERVICE_NOT_FOUND`, `BARBER_NOT_FOUND`, `ENTRY_NOT_FOUND` |
| 409 | `ALREADY_IN_QUEUE`, `BARBER_BUSY`, `INVALID_TRANSITION`, `NO_BARBER_AVAILABLE` |
| 500 | `INTERNAL_ERROR` |

## `GET /api/shops/:shopId/queue`

The live queue for every barber in the shop.

- **Auth:** none required. The owner gets `view: "owner"` (customer details included);
  everyone else gets `view: "public"` (no names, phones or entry ids).
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
        "nextAvailableAt": "2026-09-30T10:35:00.000Z"
      }
    ]
  }
}
```

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
active place in this shop) / `NO_BARBER_AVAILABLE`.

## Queue actions

| Endpoint | Transition |
|---|---|
| `POST /api/queue/:id/start` | `WAITING` → `IN_PROGRESS` (any waiting customer, e.g. if #1 is late) |
| `POST /api/queue/:id/complete` | `IN_PROGRESS` → `COMPLETED` (the next customer moves up; not auto-started) |
| `POST /api/queue/:id/cancel` | `WAITING` or `IN_PROGRESS` → `CANCELLED` |
| `POST /api/queue/:id/no-show` | `WAITING` → `NO_SHOW` |

- **Auth:** owner only. The shop comes from the session; an entry from another shop is `404`.
- **Params:** `id` — queue entry UUID. **Body:** none.
- **200:** the recalculated queue — the same shape as `GET /api/shops/:shopId/queue` (owner view).

**Errors:** 400 invalid `id` · 401 `UNAUTHENTICATED` · 403 `FORBIDDEN` · 404 `ENTRY_NOT_FOUND` ·
409 `INVALID_TRANSITION` (the entry's current status doesn't allow it, including repeated taps) ·
409 `BARBER_BUSY` (start only: the barber already has a customer in progress).

## Tests

`pnpm test:api` builds the app, starts it against the `_test` database and calls every
endpoint over HTTP (see [`server/testing/api/queue.api.test.ts`](../server/testing/api/queue.api.test.ts)).
