// Every queue endpoint over real HTTP against the built server (see api-server.ts).
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import type {
  JoinQueueResultDto,
  OwnerShopQueueDto,
  PublicShopQueueDto
} from '../../../shared/types/queue'
import { useDb } from '../../db'
import { queueEntries } from '../../db/schema'
import { createShopFixture, resetDatabase, resetShopData, type ShopFixture } from '../fixtures'

const baseUrl = inject('apiBaseUrl')

interface ApiResponse {
  status: number
  // Arbitrary JSON; each test asserts the parts it cares about.
  json: any
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown, rawBody?: string, cookie?: string } = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = { origin: baseUrl }
  if (options.cookie) {
    headers.cookie = options.cookie
  }
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers['content-type'] = 'application/json'
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  })
  return { status: response.status, json: await response.json() }
}

async function signUp(email: string): Promise<{ userId: string, cookie: string }> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ name: 'Test User', email, password: 'correct-horse-battery' })
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { user: { id: string } }
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  expect(cookie).toContain('session_token')
  return { userId: body.user.id, cookie }
}

let owner: { userId: string, cookie: string }
let outsider: { userId: string, cookie: string }
let shop: ShopFixture

beforeAll(async () => {
  await resetDatabase()
  owner = await signUp('owner@trimly.test')
  outsider = await signUp('outsider@trimly.test')
})

beforeEach(async () => {
  await resetShopData()
  shop = await createShopFixture({ ownerUserId: owner.userId, bufferMinutes: 5 })
})

function joinAsCustomer(name: string, phone: string, serviceId = shop.services.haircut) {
  return request('POST', `/api/shops/${shop.shopId}/queue`, { body: { name, phone, serviceId } })
}

function walkIn(name: string, serviceId = shop.services.beard) {
  return request('POST', `/api/shops/${shop.shopId}/queue`, { body: { name, serviceId }, cookie: owner.cookie })
}

function act(action: 'start' | 'complete' | 'cancel' | 'no-show', entryId: string, cookie = owner.cookie) {
  return request('POST', `/api/queue/${entryId}/${action}`, { cookie })
}

function expectError(response: ApiResponse, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(response.json).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) })
}

describe('GET /api/shops/:shopId/queue', () => {
  it('returns an anonymized queue to the public', async () => {
    await joinAsCustomer('Arjun', '+91 99900 00001')

    const response = await request('GET', `/api/shops/${shop.shopId}/queue`)
    const queue = response.json.data as PublicShopQueueDto

    expect(response.status).toBe(200)
    expect(queue.view).toBe('public')
    expect(queue.barbers).toHaveLength(1)
    expect(queue.barbers[0]!.waiting).toEqual([
      expect.objectContaining({ position: 1, customersAhead: 0, entry: { serviceName: 'Haircut', durationMinutes: 20 } })
    ])
    const raw = JSON.stringify(response.json)
    expect(raw).not.toContain('Arjun')
    expect(raw).not.toContain('+9199900')
  })

  it('returns the full queue to the shop owner', async () => {
    await joinAsCustomer('Arjun', '+91 99900 00001')

    const response = await request('GET', `/api/shops/${shop.shopId}/queue`, { cookie: owner.cookie })
    const queue = response.json.data as OwnerShopQueueDto

    expect(response.status).toBe(200)
    expect(queue.view).toBe('owner')
    expect(queue.barbers[0]!.waiting[0]!.entry).toMatchObject({
      status: 'WAITING',
      source: 'ONLINE',
      customer: { name: 'Arjun', phone: '+919990000001' }
    })
  })

  it('treats another signed-in user as public', async () => {
    const response = await request('GET', `/api/shops/${shop.shopId}/queue`, { cookie: outsider.cookie })
    expect(response.json.data.view).toBe('public')
  })

  it('rejects an invalid shop id with 400', async () => {
    const response = await request('GET', '/api/shops/not-a-uuid/queue')
    expectError(response, 400, 'VALIDATION_ERROR')
    expect(response.json.error.details).toEqual([expect.objectContaining({ path: 'shopId' })])
  })

  it('returns 404 for an unknown shop', async () => {
    expectError(await request('GET', `/api/shops/${randomUUID()}/queue`), 404, 'SHOP_NOT_FOUND')
  })
})

describe('POST /api/shops/:shopId/queue', () => {
  it('lets a customer join online and returns a server-calculated position and ETA', async () => {
    const response = await joinAsCustomer('Arjun', '+91 99900 00001')
    const result = response.json.data as JoinQueueResultDto

    expect(response.status).toBe(201)
    expect(result.trackingCode).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.entry).toMatchObject({ status: 'WAITING', position: 1, customersAhead: 0, waitMinutes: 0 })
    expect(result.entry.estimatedStart).toBe(result.entry.calculatedAt)

    const stored = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, result.entry.id) })
    expect(stored?.source).toBe('ONLINE')
  })

  it('places later customers behind earlier ones', async () => {
    await joinAsCustomer('Arjun', '+91 99900 00001')
    const response = await joinAsCustomer('Nabil', '+91 99900 00002', shop.services.beard)

    expect(response.json.data.entry).toMatchObject({ position: 2, customersAhead: 1, waitMinutes: 25 })
  })

  it('lets the owner add a walk-in without a phone number', async () => {
    const response = await walkIn('Walk-in')

    expect(response.status).toBe(201)
    const stored = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, response.json.data.entry.id) })
    expect(stored?.source).toBe('WALK_IN')
  })

  it('requires a phone number for online joins', async () => {
    const response = await request('POST', `/api/shops/${shop.shopId}/queue`, {
      body: { name: 'Arjun', serviceId: shop.services.haircut }
    })
    expectError(response, 400, 'PHONE_REQUIRED')
  })

  it('rejects client-supplied position, ETA or source', async () => {
    for (const extra of [{ position: 1 }, { estimatedStart: new Date().toISOString() }, { source: 'WALK_IN' }]) {
      const response = await request('POST', `/api/shops/${shop.shopId}/queue`, {
        body: { name: 'Arjun', phone: '+919990000001', serviceId: shop.services.haircut, ...extra }
      })
      expectError(response, 400, 'VALIDATION_ERROR')
    }
    const entries = await useDb().select().from(queueEntries)
    expect(entries).toHaveLength(0)
  })

  it('validates the body fields', async () => {
    const response = await request('POST', `/api/shops/${shop.shopId}/queue`, {
      body: { name: '  ', phone: '12345', serviceId: 'nope' }
    })

    expectError(response, 400, 'VALIDATION_ERROR')
    expect(response.json.error.details.map((issue: { path: string }) => issue.path).sort())
      .toEqual(['name', 'phone', 'serviceId'])
  })

  it('rejects a missing or malformed body', async () => {
    expectError(await request('POST', `/api/shops/${shop.shopId}/queue`), 400, 'VALIDATION_ERROR')
    const malformed = await request('POST', `/api/shops/${shop.shopId}/queue`, { rawBody: '{"name":' })
    expect(malformed.status).toBe(400)
    expect(malformed.json.error.code).toMatch(/^(BAD_REQUEST|VALIDATION_ERROR)$/)
  })

  it('rejects the same phone joining twice with 409', async () => {
    await joinAsCustomer('Arjun', '+91 99900 00001')
    expectError(await joinAsCustomer('Arjun again', '+919990000001'), 409, 'ALREADY_IN_QUEUE')
  })

  it('returns 404 for a service or barber that is not in this shop', async () => {
    const unknownService = await joinAsCustomer('Arjun', '+919990000001', randomUUID())
    expectError(unknownService, 404, 'SERVICE_NOT_FOUND')

    const unknownBarber = await request('POST', `/api/shops/${shop.shopId}/queue`, {
      body: { name: 'Arjun', phone: '+919990000001', serviceId: shop.services.haircut, barberId: randomUUID() }
    })
    expectError(unknownBarber, 404, 'BARBER_NOT_FOUND')
  })

  it('returns 404 for an unknown shop', async () => {
    const response = await request('POST', `/api/shops/${randomUUID()}/queue`, {
      body: { name: 'Arjun', phone: '+919990000001', serviceId: shop.services.haircut }
    })
    expectError(response, 404, 'SHOP_NOT_FOUND')
  })
})

describe('POST /api/queue/:id/{start,complete,cancel,no-show}', () => {
  async function twoWaiting() {
    const a = (await joinAsCustomer('Arjun', '+919990000001')).json.data.entry.id as string
    const b = (await walkIn('Walk-in')).json.data.entry.id as string
    return { a, b }
  }

  it('start: moves the customer into the chair and returns the recalculated queue', async () => {
    const { a, b } = await twoWaiting()

    const response = await act('start', a)
    const queue = response.json.data as OwnerShopQueueDto

    expect(response.status).toBe(200)
    expect(queue.view).toBe('owner')
    expect(queue.barbers[0]!.current?.entry).toMatchObject({ id: a, status: 'IN_PROGRESS' })
    expect(queue.barbers[0]!.waiting).toEqual([expect.objectContaining({ position: 1, customersAhead: 1 })])
    expect(queue.barbers[0]!.waiting[0]!.entry.id).toBe(b)
  })

  it('start: prevents a second active service for the same barber with 409', async () => {
    const { a, b } = await twoWaiting()
    await act('start', a)

    expectError(await act('start', b), 409, 'BARBER_BUSY')
  })

  it('complete: frees the barber and recalculates the next ETA from the actual end', async () => {
    const { a, b } = await twoWaiting()
    await act('start', a)

    const response = await act('complete', a)
    const lane = (response.json.data as OwnerShopQueueDto).barbers[0]!
    const completed = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, a) })

    expect(response.status).toBe(200)
    expect(lane.current).toBeNull()
    expect(lane.waiting[0]).toMatchObject({ position: 1, customersAhead: 0 })
    expect(lane.waiting[0]!.entry.id).toBe(b)
    expect(new Date(lane.waiting[0]!.estimatedStart).getTime())
      .toBe(completed!.endedAt!.getTime() + 5 * 60_000)
  })

  it('complete: rejects an invalid transition with 409', async () => {
    const { a } = await twoWaiting()

    expectError(await act('complete', a), 409, 'INVALID_TRANSITION')
    await act('start', a)
    await act('complete', a)
    expectError(await act('complete', a), 409, 'INVALID_TRANSITION')
  })

  it('cancel: removes the customer and moves everyone behind up', async () => {
    const { a, b } = await twoWaiting()

    const response = await act('cancel', a)
    const lane = (response.json.data as OwnerShopQueueDto).barbers[0]!

    expect(response.status).toBe(200)
    expect(lane.waiting.map(item => [item.entry.id, item.position])).toEqual([[b, 1]])
    expectError(await act('cancel', a), 409, 'INVALID_TRANSITION')
  })

  it('no-show: marks a waiting customer and rejects it for one in the chair', async () => {
    const { a, b } = await twoWaiting()

    const response = await act('no-show', a)
    expect(response.status).toBe(200)
    expect((response.json.data as OwnerShopQueueDto).barbers[0]!.waiting[0]!.entry.id).toBe(b)

    await act('start', b)
    expectError(await act('no-show', b), 409, 'INVALID_TRANSITION')
  })

  it.each(['start', 'complete', 'cancel', 'no-show'] as const)('%s: requires sign-in (401)', async (action) => {
    const { a } = await twoWaiting()
    expectError(await request('POST', `/api/queue/${a}/${action}`), 401, 'UNAUTHENTICATED')
  })

  it.each(['start', 'complete', 'cancel', 'no-show'] as const)('%s: requires owning a shop (403)', async (action) => {
    const { a } = await twoWaiting()
    expectError(await act(action, a, outsider.cookie), 403, 'FORBIDDEN')
  })

  it.each(['start', 'complete', 'cancel', 'no-show'] as const)('%s: validates the entry id (400)', async (action) => {
    expectError(await act(action, 'not-a-uuid'), 400, 'VALIDATION_ERROR')
  })

  it.each(['start', 'complete', 'cancel', 'no-show'] as const)('%s: returns 404 for an unknown entry', async (action) => {
    expectError(await act(action, randomUUID()), 404, 'ENTRY_NOT_FOUND')
  })

  it('cannot act on another shop’s entries (404, not revealed)', async () => {
    const otherOwner = await signUp(`other-${randomUUID()}@trimly.test`)
    const otherShop = await createShopFixture({ ownerUserId: otherOwner.userId, slug: `other-${randomUUID()}` })
    const foreign = await request('POST', `/api/shops/${otherShop.shopId}/queue`, {
      body: { name: 'Elsewhere', phone: '+919990000009', serviceId: otherShop.services.haircut }
    })
    const foreignId = foreign.json.data.entry.id as string

    expectError(await act('start', foreignId), 404, 'ENTRY_NOT_FOUND')
    const stored = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, foreignId) })
    expect(stored?.status).toBe('WAITING')
  })
})
