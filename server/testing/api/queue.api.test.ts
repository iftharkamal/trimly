// Every queue endpoint over real HTTP against the built server (see api-server.ts).
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  JoinQueueResultDto,
  OwnerShopQueueDto,
  PublicShopQueueDto,
  QueueTrackingDto
} from '../../../shared/types/queue'
import { useDb } from '../../db'
import { payments, queueEntries } from '../../db/schema'
import { createShopFixture, resetDatabase, resetShopData, type ShopFixture } from '../fixtures'
import { expectError, request, signUp, type ApiResponse } from './http'

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

describe('GET /api/dashboard', () => {
  it('returns the owner’s shop, name and today’s numbers', async () => {
    const entryId = (await joinAsCustomer('Arjun', '+919990000001')).json.data.entry.id as string
    await walkIn('Walk-in')
    await act('start', entryId)
    // Paid with a discount: revenue is what was received, not the list price.
    await request('POST', `/api/queue/${entryId}/complete`, {
      body: { payment: { method: 'CASH', amountMinor: 12000 } },
      cookie: owner.cookie
    })

    const response = await request('GET', '/api/dashboard', { cookie: owner.cookie })

    expect(response.status).toBe(200)
    expect(response.json.data).toEqual({
      shop: { id: shop.shopId, name: 'Test Barber', slug: 'test-barber', timezone: 'Asia/Kolkata', currency: 'INR', isOpen: true },
      owner: { name: 'Test User' },
      barbers: [{ id: shop.barberId, name: 'Faisal' }],
      today: { customers: 2, servicesCompleted: 1, revenueMinor: 12000 }
    })
  })

  it('requires sign-in (401) and a shop (403)', async () => {
    expectError(await request('GET', '/api/dashboard'), 401, 'UNAUTHENTICATED')
    expectError(await request('GET', '/api/dashboard', { cookie: outsider.cookie }), 403, 'FORBIDDEN')
  })
})

describe('GET /api/shops/:shopId/services', () => {
  it('lists active services, cheapest first, without sign-in', async () => {
    const response = await request('GET', `/api/shops/${shop.shopId}/services`)

    expect(response.status).toBe(200)
    expect(response.json.data).toEqual([
      { id: shop.services.beard, name: 'Beard', durationMinutes: 10, priceMinor: 10000 },
      { id: shop.services.haircut, name: 'Haircut', durationMinutes: 20, priceMinor: 15000 },
      { id: shop.services.haircutAndBeard, name: 'Haircut + Beard', durationMinutes: 30, priceMinor: 22000 }
    ])
  })

  it('validates the shop id (400) and rejects an unknown shop (404)', async () => {
    expectError(await request('GET', '/api/shops/not-a-uuid/services'), 400, 'VALIDATION_ERROR')
    expectError(await request('GET', `/api/shops/${randomUUID()}/services`), 404, 'SHOP_NOT_FOUND')
  })
})

describe('GET /api/shops/by-slug/:slug', () => {
  it('returns the public shop profile', async () => {
    const response = await request('GET', '/api/shops/by-slug/test-barber')

    expect(response.status).toBe(200)
    expect(response.json.data).toEqual({
      id: shop.shopId,
      name: 'Test Barber',
      slug: 'test-barber',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      isOpen: true
    })
  })

  it('rejects a malformed slug (400) and an unknown one (404)', async () => {
    expectError(await request('GET', '/api/shops/by-slug/Not_Valid'), 400, 'VALIDATION_ERROR')
    expectError(await request('GET', '/api/shops/by-slug/no-such-shop'), 404, 'SHOP_NOT_FOUND')
  })
})

describe('queue join preview', () => {
  it('tells a customer where they would be before joining', async () => {
    await joinAsCustomer('Arjun', '+919990000001') // haircut, 20 min

    const queue = (await request('GET', `/api/shops/${shop.shopId}/queue`)).json.data as PublicShopQueueDto

    expect(queue.soonestBarberId).toBe(shop.barberId)
    // Arjun 0–20, then the buffer: a new customer would be #2, starting in 25 minutes.
    expect(queue.barbers[0]!.joinPreview).toMatchObject({ position: 2, customersAhead: 1, waitMinutes: 25 })
  })
})

describe('PATCH /api/dashboard/shop', () => {
  /** `cookie: null` sends the request signed out. */
  function setOpen(isOpen: unknown, cookie: string | null = owner.cookie, extra: object = {}) {
    return request('PATCH', '/api/dashboard/shop', { body: { isOpen, ...extra }, cookie: cookie ?? undefined })
  }

  it('closes the shop to online joins but still allows walk-ins', async () => {
    const closed = await setOpen(false)
    expect(closed.status).toBe(200)
    expect(closed.json.data.isOpen).toBe(false)
    expect((await request('GET', '/api/shops/by-slug/test-barber')).json.data.isOpen).toBe(false)

    expectError(await joinAsCustomer('Arjun', '+919990000001'), 409, 'SHOP_CLOSED')
    expect((await walkIn('Walk-in')).status).toBe(201)

    expect((await setOpen(true)).json.data.isOpen).toBe(true)
    expect((await joinAsCustomer('Arjun', '+919990000001')).status).toBe(201)
  })

  it('requires the owner and a strict boolean body', async () => {
    expectError(await setOpen(false, null), 401, 'UNAUTHENTICATED')
    expectError(await setOpen(false, outsider.cookie), 403, 'FORBIDDEN')
    expectError(await setOpen('no'), 400, 'VALIDATION_ERROR')
    expectError(await setOpen(false, owner.cookie, { name: 'Renamed' }), 400, 'VALIDATION_ERROR')
  })
})

describe('GET /api/track/:trackingCode and POST /api/track/:trackingCode/cancel', () => {
  async function joinForCode(name: string, phone: string, serviceId = shop.services.haircut) {
    return ((await joinAsCustomer(name, phone, serviceId)).json.data as JoinQueueResultDto).trackingCode
  }

  function track(code: string) {
    return request('GET', `/api/track/${code}`)
  }

  it('shows the customer their place with a server-decided state', async () => {
    await joinForCode('Arjun', '+919990000001') // haircut 20
    await joinForCode('Nabil', '+919990000002', shop.services.beard) // beard 10
    const code = await joinForCode('Rahul', '+919990000003') // haircut 20

    const response = await track(code)
    const tracking = response.json.data as QueueTrackingDto

    expect(response.status).toBe(200)
    // Arjun 0–20, Nabil 25–35, Rahul 40–60: 40 minutes away, so still WAITING.
    expect(tracking).toMatchObject({
      state: 'WAITING',
      status: 'WAITING',
      position: 3,
      customersAhead: 2,
      waitMinutes: 40,
      customerName: 'Rahul',
      serviceName: 'Haircut',
      priceMinor: 15000,
      barberName: 'Faisal',
      shop: { name: 'Test Barber', slug: 'test-barber', timezone: 'Asia/Kolkata', currency: 'INR' }
    })
    expect(new Date(tracking.estimatedEnd!).getTime() - new Date(tracking.estimatedStart!).getTime())
      .toBe(20 * 60_000)
    // Never exposes other customers.
    expect(JSON.stringify(response.json)).not.toContain('Arjun')
  })

  it('moves through GETTING_CLOSE, YOU_ARE_NEXT, IN_PROGRESS and COMPLETED', async () => {
    const first = (await joinAsCustomer('Arjun', '+919990000001', shop.services.beard)).json.data as JoinQueueResultDto
    const code = await joinForCode('Nabil', '+919990000002')

    // Arjun's beard (10) plus the buffer (5): Nabil starts in 15 minutes.
    expect((await track(code)).json.data).toMatchObject({ state: 'GETTING_CLOSE', position: 2 })

    await act('start', first.entry.id)
    expect((await track(code)).json.data).toMatchObject({ state: 'YOU_ARE_NEXT', position: 1, customersAhead: 1 })

    await act('complete', first.entry.id)
    const nabilId = (await track(code)).json.data.id as string
    await act('start', nabilId)
    expect((await track(code)).json.data).toMatchObject({ state: 'IN_PROGRESS', position: null })

    await act('complete', nabilId)
    expect((await track(code)).json.data).toMatchObject({ state: 'COMPLETED', estimatedStart: null })
  })

  it('shows a no-show as CANCELLED, keeping the real status', async () => {
    const code = await joinForCode('Arjun', '+919990000001')
    await act('no-show', (await track(code)).json.data.id)

    expect((await track(code)).json.data).toMatchObject({ state: 'CANCELLED', status: 'NO_SHOW' })
  })

  it('lets the customer leave while waiting, and only then', async () => {
    const code = await joinForCode('Arjun', '+919990000001')

    const left = await request('POST', `/api/track/${code}/cancel`)
    expect(left.status).toBe(200)
    expect(left.json.data).toMatchObject({ state: 'CANCELLED', status: 'CANCELLED' })
    expectError(await request('POST', `/api/track/${code}/cancel`), 409, 'INVALID_TRANSITION')

    const inChair = await joinForCode('Nabil', '+919990000002')
    await act('start', (await track(inChair)).json.data.id)
    expectError(await request('POST', `/api/track/${inChair}/cancel`), 409, 'INVALID_TRANSITION')
  })

  it('validates the code (400) and hides unknown codes (404)', async () => {
    expectError(await track('not-a-code'), 400, 'VALIDATION_ERROR')
    expectError(await track(randomUUID()), 404, 'ENTRY_NOT_FOUND')
    expectError(await request('POST', `/api/track/${randomUUID()}/cancel`), 404, 'ENTRY_NOT_FOUND')
  })
})

describe('POST /api/queue/:id/complete with a payment', () => {
  async function inChair() {
    const entryId = (await walkIn('Walk-in', shop.services.haircut)).json.data.entry.id as string
    await act('start', entryId)
    return entryId
  }

  function completeWith(entryId: string, body: unknown) {
    return request('POST', `/api/queue/${entryId}/complete`, { body, cookie: owner.cookie })
  }

  async function todayRevenue() {
    return (await request('GET', '/api/dashboard', { cookie: owner.cookie })).json.data.today.revenueMinor as number
  }

  it.each(['CASH', 'UPI', 'CARD'] as const)('records a %s payment and updates revenue', async (method) => {
    const entryId = await inChair()

    const response = await completeWith(entryId, { payment: { method, amountMinor: 15000 } })

    expect(response.status).toBe(200)
    expect(response.json.data.barbers[0].current).toBeNull()
    const payment = await useDb().query.payments.findFirst({ where: eq(payments.queueEntryId, entryId) })
    expect(payment).toMatchObject({ method, amountMinor: 15000, status: 'PAID' })
    expect(await todayRevenue()).toBe(15000)
  })

  it('completes without a payment when none is given', async () => {
    const withNull = await inChair()
    expect((await completeWith(withNull, { payment: null })).status).toBe(200)

    const withEmpty = await inChair()
    expect((await completeWith(withEmpty, {})).status).toBe(200)

    expect(await useDb().select().from(payments)).toHaveLength(0)
    expect(await todayRevenue()).toBe(0)
  })

  it('validates the payment and completes nothing when it is invalid', async () => {
    const entryId = await inChair()

    for (const payment of [
      { method: 'BITCOIN', amountMinor: 15000 },
      { method: 'CASH', amountMinor: -100 },
      { method: 'CASH', amountMinor: 150.5 },
      { method: 'CASH' },
      { method: 'CASH', amountMinor: 15000, status: 'REFUNDED' }
    ]) {
      expectError(await completeWith(entryId, { payment }), 400, 'VALIDATION_ERROR')
    }
    expectError(await completeWith(entryId, { payment: { method: 'CASH', amountMinor: 15000 }, tip: 5 }), 400, 'VALIDATION_ERROR')

    const stored = await useDb().query.queueEntries.findFirst({ where: eq(queueEntries.id, entryId) })
    expect(stored?.status).toBe('IN_PROGRESS')
    expect(await useDb().select().from(payments)).toHaveLength(0)
  })

  it('records no payment for a service that cannot be completed', async () => {
    const waiting = (await walkIn('Walk-in')).json.data.entry.id as string

    expectError(await completeWith(waiting, { payment: { method: 'CASH', amountMinor: 10000 } }), 409, 'INVALID_TRANSITION')
    expect(await useDb().select().from(payments)).toHaveLength(0)
  })
})

describe('GET /api/reports', () => {
  function report(query = '', cookie: string | null = owner.cookie) {
    return request('GET', `/api/reports${query}`, { cookie: cookie ?? undefined })
  }

  it('reports today by default, including a payment just taken', async () => {
    const entryId = (await walkIn('Walk-in', shop.services.haircut)).json.data.entry.id as string
    await act('start', entryId)
    await request('POST', `/api/queue/${entryId}/complete`, {
      body: { payment: { method: 'UPI', amountMinor: 15000 } },
      cookie: owner.cookie
    })

    const response = await report()

    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({
      period: 'day',
      nextDate: null,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      totals: { revenueMinor: 15000, services: 1, customers: 1, payments: 1, averageBillMinor: 15000 },
      trend: { unit: 'hour' }
    })
    expect(response.json.data.trend.buckets).toHaveLength(24)
  })

  it('supports weekly and monthly periods for any date', async () => {
    const week = await report('?period=week&date=2026-09-30')
    expect(week.json.data).toMatchObject({ period: 'week', start: '2026-09-28', end: '2026-10-05' })
    expect(week.json.data.trend.buckets).toHaveLength(7)

    const month = await report('?period=month&date=2026-02-10')
    expect(month.json.data).toMatchObject({ period: 'month', start: '2026-02-01', end: '2026-03-01' })
    expect(month.json.data.trend.buckets).toHaveLength(28)
  })

  it('validates the query (400)', async () => {
    expectError(await report('?period=year'), 400, 'VALIDATION_ERROR')
    expectError(await report('?date=2026-02-30'), 400, 'VALIDATION_ERROR')
    expectError(await report('?date=30-09-2026'), 400, 'VALIDATION_ERROR')
    expectError(await report('?period=day&shopId=someone-else'), 400, 'VALIDATION_ERROR')
  })

  it('requires the owner (401, 403)', async () => {
    expectError(await report('', null), 401, 'UNAUTHENTICATED')
    expectError(await report('', outsider.cookie), 403, 'FORBIDDEN')
  })
})

describe('opening hours: GET/PUT /api/dashboard/hours', () => {
  const week = (ranges: { opens: string, closes: string }[]) =>
    ({ days: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, ranges: weekday === 7 ? [] : ranges })) })

  it('saves and returns the weekly schedule', async () => {
    const body = week([{ opens: '09:00', closes: '13:00' }, { opens: '14:00', closes: '20:00' }])

    const saved = await request('PUT', '/api/dashboard/hours', { body, cookie: owner.cookie })
    expect(saved.status).toBe(200)
    expect(saved.json.data).toEqual(body)

    expect((await request('GET', '/api/dashboard/hours', { cookie: owner.cookie })).json.data).toEqual(body)
  })

  it('rejects invalid schedules (400)', async () => {
    const put = (body: unknown) => request('PUT', '/api/dashboard/hours', { body, cookie: owner.cookie })

    expectError(await put(week([{ opens: '18:00', closes: '09:00' }])), 400, 'VALIDATION_ERROR')
    expectError(await put(week([{ opens: '09:00', closes: '14:00' }, { opens: '13:00', closes: '20:00' }])), 400, 'VALIDATION_ERROR')
    expectError(await put(week([{ opens: '9am', closes: '5pm' }])), 400, 'VALIDATION_ERROR')
    expectError(await put({ days: [] }), 400, 'VALIDATION_ERROR')
  })

  it('requires the owner (401, 403)', async () => {
    expectError(await request('GET', '/api/dashboard/hours'), 401, 'UNAUTHENTICATED')
    expectError(await request('GET', '/api/dashboard/hours', { cookie: outsider.cookie }), 403, 'FORBIDDEN')
  })
})

describe('appointments: /api/dashboard/appointments', () => {
  function inMinutes(minutes: number) {
    return new Date(Math.ceil(Date.now() / 60_000) * 60_000 + minutes * 60_000).toISOString()
  }

  function bookVia(body: Record<string, unknown>, cookie: string | null = owner.cookie) {
    return request('POST', '/api/dashboard/appointments', { body, cookie: cookie ?? undefined })
  }

  const booking = (startsAt: string, phone = '+919990000200') => ({
    customer: { name: 'Booked', phone },
    serviceId: shop.services.haircut,
    startsAt
  })

  it('books, lists, and checks in into the queue', async () => {
    const startsAt = inMinutes(60)
    const created = await bookVia(booking(startsAt))
    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({ status: 'BOOKED', source: 'BARBER', serviceName: 'Haircut' })

    // A window around the booking, wide enough for any timezone offset.
    const from = new Date(Date.parse(startsAt) - 86_400_000).toISOString().slice(0, 10)
    const to = new Date(Date.parse(startsAt) + 2 * 86_400_000).toISOString().slice(0, 10)
    const list = await request('GET', `/api/dashboard/appointments?from=${from}&to=${to}`, { cookie: owner.cookie })
    expect(list.status).toBe(200)
    expect(list.json.data.map((item: { id: string }) => item.id)).toContain(created.json.data.id)

    const checkedIn = await request('POST', `/api/dashboard/appointments/${created.json.data.id}/check-in`, { cookie: owner.cookie })
    expect(checkedIn.status).toBe(200)
    expect(checkedIn.json.data.view).toBe('owner')
    expect(checkedIn.json.data.barbers[0].waiting[0].entry).toMatchObject({ source: 'APPOINTMENT', customer: { name: 'Booked' } })

    expectError(await request('POST', `/api/dashboard/appointments/${created.json.data.id}/check-in`, { cookie: owner.cookie }), 409, 'INVALID_TRANSITION')
  })

  it('rejects taken, past and invalid bookings', async () => {
    const startsAt = inMinutes(90)
    await bookVia(booking(startsAt))

    expectError(await bookVia(booking(startsAt, '+919990000201')), 409, 'SLOT_TAKEN')
    expectError(await bookVia(booking(inMinutes(-10), '+919990000202')), 400, 'INVALID_TIME')
    expectError(await bookVia(booking('tomorrow at 10', '+919990000203')), 400, 'VALIDATION_ERROR')
    expectError(await bookVia({ ...booking(inMinutes(300), '+919990000204'), status: 'CHECKED_IN' }), 400, 'VALIDATION_ERROR')
  })

  it('cancels or marks a no-show, only while booked', async () => {
    const first = (await bookVia(booking(inMinutes(60)))).json.data.id as string
    const cancelled = await request('POST', `/api/dashboard/appointments/${first}/cancel`, { cookie: owner.cookie })
    expect(cancelled.json.data.status).toBe('CANCELLED')
    expectError(await request('POST', `/api/dashboard/appointments/${first}/no-show`, { cookie: owner.cookie }), 409, 'INVALID_TRANSITION')

    const second = (await bookVia(booking(inMinutes(120), '+919990000210'))).json.data.id as string
    const noShow = await request('POST', `/api/dashboard/appointments/${second}/no-show`, { cookie: owner.cookie })
    expect(noShow.json.data.status).toBe('NO_SHOW')
  })

  it('validates list ranges and ids, and requires the owner', async () => {
    expectError(await request('GET', '/api/dashboard/appointments?from=2026-10-10&to=2026-10-01', { cookie: owner.cookie }), 400, 'VALIDATION_ERROR')
    expectError(await request('GET', '/api/dashboard/appointments?from=2026-01-01&to=2026-12-31', { cookie: owner.cookie }), 400, 'VALIDATION_ERROR')
    expectError(await request('POST', '/api/dashboard/appointments/not-a-uuid/cancel', { cookie: owner.cookie }), 400, 'VALIDATION_ERROR')
    expectError(await request('POST', `/api/dashboard/appointments/${randomUUID()}/cancel`, { cookie: owner.cookie }), 404, 'APPOINTMENT_NOT_FOUND')
    expectError(await bookVia(booking(inMinutes(60)), null), 401, 'UNAUTHENTICATED')
    expectError(await bookVia(booking(inMinutes(60)), outsider.cookie), 403, 'FORBIDDEN')
  })
})

describe('online booking: availability, booking and the booking link', () => {
  async function openAllDay() {
    const days = [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, ranges: [{ opens: '00:00', closes: '23:59' }] }))
    await request('PUT', '/api/dashboard/hours', { body: { days }, cookie: owner.cookie })
  }

  async function firstSlot(serviceId = shop.services.haircut): Promise<string> {
    const availability = await request('GET', `/api/shops/${shop.shopId}/availability?serviceId=${serviceId}`)
    const slot = (availability.json.data.days as { slots: { startsAt: string }[] }[]).flatMap(day => day.slots)[0]
    if (!slot) {
      throw new Error('No slot offered')
    }
    return slot.startsAt
  }

  function bookOnline(startsAt: string, phone = '+919990000400', extra: object = {}) {
    return request('POST', `/api/shops/${shop.shopId}/appointments`, {
      body: { customer: { name: 'Online', phone }, serviceId: shop.services.haircut, startsAt, ...extra }
    })
  }

  it('offers 14 days of slots without sign-in', async () => {
    await openAllDay()

    const response = await request('GET', `/api/shops/${shop.shopId}/availability?serviceId=${shop.services.haircut}`)

    expect(response.status).toBe(200)
    expect(response.json.data.timeZone).toBe('Asia/Kolkata')
    expect(response.json.data.days).toHaveLength(14)
    const slots = (response.json.data.days as { slots: { startsAt: string }[] }[]).flatMap(day => day.slots)
    expect(slots.length).toBeGreaterThan(0)
    // At least 30 minutes' notice.
    expect(new Date(slots[0]!.startsAt).getTime()).toBeGreaterThanOrEqual(Date.now() + 29 * 60_000)
  })

  it('offers nothing when the shop has no opening hours', async () => {
    const response = await request('GET', `/api/shops/${shop.shopId}/availability?serviceId=${shop.services.haircut}`)
    expect((response.json.data.days as { slots: unknown[] }[]).every(day => day.slots.length === 0)).toBe(true)
  })

  it('books an offered slot and returns the private booking link code', async () => {
    await openAllDay()
    const startsAt = await firstSlot()

    const response = await bookOnline(startsAt)

    expect(response.status).toBe(201)
    expect(response.json.data.trackingCode).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.json.data.booking).toMatchObject({
      status: 'BOOKED',
      startsAt,
      serviceName: 'Haircut',
      customerName: 'Online',
      barberName: 'Faisal',
      canCancel: true,
      queueTrackingCode: null,
      shop: { slug: 'test-barber' }
    })
    // Shown to the barber as an online booking.
    const list = await request('GET', `/api/dashboard/appointments?from=${startsAt.slice(0, 10)}&to=${new Date(Date.parse(startsAt) + 2 * 86_400_000).toISOString().slice(0, 10)}`, { cookie: owner.cookie })
    expect(list.json.data.find((item: { startsAt: string }) => item.startsAt === startsAt)).toMatchObject({ source: 'ONLINE' })
  })

  it('refuses times that were not offered or are taken (409)', async () => {
    await openAllDay()
    const startsAt = await firstSlot()
    await bookOnline(startsAt)

    expectError(await bookOnline(startsAt, '+919990000401'), 409, 'SLOT_UNAVAILABLE')
    expectError(await bookOnline(new Date(Date.now() + 40 * 86_400_000).toISOString(), '+919990000402'), 409, 'SLOT_UNAVAILABLE')
    expectError(await bookOnline(new Date(Date.parse(startsAt) + 7 * 60_000).toISOString(), '+919990000403'), 409, 'SLOT_UNAVAILABLE')
  })

  it('requires a phone number and a strict body (400)', async () => {
    await openAllDay()
    const startsAt = await firstSlot()

    expectError(await request('POST', `/api/shops/${shop.shopId}/appointments`, {
      body: { customer: { name: 'No phone' }, serviceId: shop.services.haircut, startsAt }
    }), 400, 'VALIDATION_ERROR')
    expectError(await bookOnline(startsAt, '+919990000404', { source: 'BARBER' }), 400, 'VALIDATION_ERROR')
    expectError(await request('GET', `/api/shops/${shop.shopId}/availability?serviceId=nope`), 400, 'VALIDATION_ERROR')
  })

  it('shows and cancels the booking by its link, only while it can be cancelled', async () => {
    await openAllDay()
    const booked = await bookOnline(await firstSlot())
    const code = booked.json.data.trackingCode as string

    const view = await request('GET', `/api/bookings/${code}`)
    expect(view.status).toBe(200)
    expect(view.json.data).toMatchObject({ status: 'BOOKED', canCancel: true })

    const cancelled = await request('POST', `/api/bookings/${code}/cancel`)
    expect(cancelled.json.data).toMatchObject({ status: 'CANCELLED', canCancel: false })
    expectError(await request('POST', `/api/bookings/${code}/cancel`), 409, 'INVALID_TRANSITION')
  })

  it('links to the live queue after the barber checks the customer in', async () => {
    await openAllDay()
    const booked = await bookOnline(await firstSlot())
    const code = booked.json.data.trackingCode as string
    const list = await request('GET', `/api/dashboard/appointments?from=${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)}`, { cookie: owner.cookie })
    const appointmentId = (list.json.data as { id: string, source: string }[]).find(item => item.source === 'ONLINE')!.id

    await request('POST', `/api/dashboard/appointments/${appointmentId}/check-in`, { cookie: owner.cookie })

    const view = await request('GET', `/api/bookings/${code}`)
    expect(view.json.data.status).toBe('CHECKED_IN')
    const queueCode = view.json.data.queueTrackingCode as string
    expect((await request('GET', `/api/track/${queueCode}`)).json.data).toMatchObject({ customerName: 'Online', status: 'WAITING' })
  })

  it('validates the code (400) and hides unknown codes (404)', async () => {
    expectError(await request('GET', '/api/bookings/not-a-code'), 400, 'VALIDATION_ERROR')
    expectError(await request('GET', `/api/bookings/${randomUUID()}`), 404, 'APPOINTMENT_NOT_FOUND')
  })
})

describe('notification feeds', () => {
  it('shop feed: starts from now, then shows new online joins (owner only)', async () => {
    const start = await request('GET', '/api/dashboard/notifications', { cookie: owner.cookie })
    expect(start.status).toBe(200)
    expect(start.json.data.notifications).toEqual([])

    await joinAsCustomer('Arjun', '+919990000600')

    const next = await request('GET', `/api/dashboard/notifications?after=${start.json.data.cursor}`, { cookie: owner.cookie })
    expect(next.json.data.notifications).toEqual([
      expect.objectContaining({ type: 'CUSTOMER_JOINED_ONLINE', title: 'Arjun joined the queue' })
    ])

    expectError(await request('GET', '/api/dashboard/notifications'), 401, 'UNAUTHENTICATED')
    expectError(await request('GET', '/api/dashboard/notifications', { cookie: outsider.cookie }), 403, 'FORBIDDEN')
    expectError(await request('GET', '/api/dashboard/notifications?after=-1', { cookie: owner.cookie }), 400, 'VALIDATION_ERROR')
  })

  it('customer feed: only that customer’s "getting close" alert', async () => {
    const first = (await joinAsCustomer('Arjun', '+919990000601')).json.data as JoinQueueResultDto
    const second = (await joinAsCustomer('Nabil', '+919990000602')).json.data as JoinQueueResultDto

    // Arjun starts now (close); Nabil is 25 minutes away.
    const arjun = await request('GET', `/api/track/${first.trackingCode}/notifications?after=0`)
    expect(arjun.status).toBe(200)
    expect(arjun.json.data.notifications).toEqual([
      expect.objectContaining({ type: 'QUEUE_GETTING_CLOSE', title: 'Getting close at Test Barber' })
    ])
    const nabil = await request('GET', `/api/track/${second.trackingCode}/notifications?after=0`)
    expect(nabil.json.data.notifications).toEqual([])

    expectError(await request('GET', `/api/track/${randomUUID()}/notifications`), 404, 'ENTRY_NOT_FOUND')
  })
})
