// Fixed-window request counters in PostgreSQL: one atomic upsert per request,
// so concurrent requests and several server instances count correctly.
import { lt, sql } from 'drizzle-orm'
import { useDb } from '../db'
import { requestLimits } from '../db/schema'

export interface RequestLimit {
  max: number
  windowSeconds: number
}

export interface RequestLimitResult {
  allowed: boolean
  /** Seconds until the current window ends (when not allowed). */
  retryAfterSeconds: number
}

/** Counts one request against `key` and says whether it's within the limit. */
export async function consumeRequestLimit(key: string, limit: RequestLimit, now = new Date()): Promise<RequestLimitResult> {
  const windowMs = limit.windowSeconds * 1000
  const windowStartedAt = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  const expiresAt = new Date(windowStartedAt.getTime() + windowMs)

  // A new window starts the count again at 1; otherwise add one.
  const [row] = await useDb()
    .insert(requestLimits)
    .values({ key, windowStartedAt, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: requestLimits.key,
      set: {
        count: sql`case when ${requestLimits.windowStartedAt} = excluded.window_started_at then ${requestLimits.count} + 1 else 1 end`,
        windowStartedAt: sql`excluded.window_started_at`,
        expiresAt: sql`excluded.expires_at`
      }
    })
    .returning({ count: requestLimits.count })

  return {
    allowed: (row?.count ?? 1) <= limit.max,
    retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
  }
}

/** Deletes counters whose window has ended. Returns how many were removed. */
export async function pruneRequestLimits(now = new Date()): Promise<number> {
  const removed = await useDb()
    .delete(requestLimits)
    .where(lt(requestLimits.expiresAt, now))
    .returning({ key: requestLimits.key })
  return removed.length
}
