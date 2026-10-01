import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../db'
import { requestLimits } from '../db/schema'
import { consumeRequestLimit, pruneRequestLimits } from './request-limit.service'

const LIMIT = { max: 3, windowSeconds: 60 }
// 10:00:00 UTC, the start of a 60-second window.
const START = new Date('2026-10-01T10:00:00.000Z')
const at = (seconds: number) => new Date(START.getTime() + seconds * 1000)

beforeEach(async () => {
  await useDb().execute(sql`truncate table request_limits`)
})

describe('consumeRequestLimit', () => {
  it('allows up to the limit within a window, then refuses until it ends', async () => {
    const results = []
    for (let index = 0; index < 4; index++) {
      results.push(await consumeRequestLimit('key', LIMIT, at(10)))
    }

    expect(results.map(result => result.allowed)).toEqual([true, true, true, false])
    expect(results[3]!.retryAfterSeconds).toBe(50)
  })

  it('starts counting again in the next window', async () => {
    for (let index = 0; index < 4; index++) {
      await consumeRequestLimit('key', LIMIT, at(30))
    }

    expect((await consumeRequestLimit('key', LIMIT, at(60))).allowed).toBe(true)
  })

  it('counts each key separately', async () => {
    for (let index = 0; index < 3; index++) {
      await consumeRequestLimit('a', LIMIT, at(0))
    }

    expect((await consumeRequestLimit('a', LIMIT, at(0))).allowed).toBe(false)
    expect((await consumeRequestLimit('b', LIMIT, at(0))).allowed).toBe(true)
  })

  it('counts concurrent requests exactly', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRequestLimit('burst', { max: 5, windowSeconds: 60 }, at(5)))
    )

    expect(results.filter(result => result.allowed)).toHaveLength(5)
    const [row] = await useDb().select().from(requestLimits)
    expect(row?.count).toBe(20)
  })
})

describe('pruneRequestLimits', () => {
  it('removes only counters whose window has ended', async () => {
    await consumeRequestLimit('old', LIMIT, at(0))
    await consumeRequestLimit('current', LIMIT, at(70))

    expect(await pruneRequestLimits(at(75))).toBe(1)
    expect((await useDb().select().from(requestLimits)).map(row => row.key)).toEqual(['current'])
  })
})
