// A shop's own services: /api/shop/services. The shop always comes from the
// session; another shop's (or the seeded shop's) services are never visible
// or changeable.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMemberFixture, createShopFixture, resetDatabase, type ShopFixture } from '../fixtures'
import { expectError, request, signUp } from './http'

const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@trimly.test`

/** A real owner: signs up and creates a shop through the API, as in the app. */
async function newOwner(label: string) {
  const owner = await signUp(uniqueEmail(label), 'Owner')
  const shop = await request('POST', '/api/onboarding/shop', { cookie: owner.cookie, body: { name: `${label} Cuts`, phone: '98765 43210', currency: 'INR' } })
  return { ...owner, shopId: shop.json.data.id as string }
}

function addService(cookie: string, body: Record<string, unknown> = {}) {
  return request('POST', '/api/shop/services', { cookie, body: { name: 'Haircut', durationMinutes: 20, priceMinor: 15000, ...body } })
}

let otherShop: ShopFixture

beforeAll(async () => {
  await resetDatabase()
  // A seed-like shop (Haircut, Beard, Haircut + Beard) belonging to someone else.
  otherShop = await createShopFixture({ slug: `seeded-${randomUUID().slice(0, 6)}` })
})

describe('a new shop\'s services', () => {
  it('start empty: never the seeded or another shop\'s services', async () => {
    const owner = await newOwner('fresh')

    expect((await request('GET', '/api/shop/services', { cookie: owner.cookie })).json.data).toEqual([])
    expect((await request('GET', `/api/shops/${owner.shopId}/services`)).json.data).toEqual([])
  })

  it('are created in the session\'s shop with every field', async () => {
    const owner = await newOwner('create')

    const created = await addService(owner.cookie, { name: 'Beard trim', durationMinutes: 15, priceMinor: 8000 })

    expect(created.status).toBe(201)
    expect(created.json.data).toEqual({
      id: expect.any(String),
      shopId: owner.shopId,
      name: 'Beard trim',
      durationMinutes: 15,
      priceMinor: 8000,
      isActive: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    })
    expect((await request('GET', `/api/shops/${owner.shopId}/services`)).json.data).toEqual([
      { id: created.json.data.id, name: 'Beard trim', durationMinutes: 15, priceMinor: 8000 }
    ])
  })

  it('never take a shop from the request', async () => {
    const owner = await newOwner('forged')

    expectError(await addService(owner.cookie, { shopId: otherShop.shopId }), 400, 'VALIDATION_ERROR')
    expectError(await request('PATCH', `/api/shop/services/${otherShop.services.haircut}`, { cookie: owner.cookie, body: { priceMinor: 1 } }), 404, 'SERVICE_NOT_FOUND')
    expectError(await request('DELETE', `/api/shop/services/${otherShop.services.beard}`, { cookie: owner.cookie }), 404, 'SERVICE_NOT_FOUND')
    // Untouched.
    const theirs = (await request('GET', `/api/shops/${otherShop.shopId}/services`)).json.data as { id: string, priceMinor: number }[]
    expect(theirs.map(service => service.id)).toContain(otherShop.services.beard)
    expect(theirs.find(service => service.id === otherShop.services.haircut)?.priceMinor).toBe(150_00)
  })
})

describe('deleting a service', () => {
  it('removes a never-used service for good', async () => {
    const owner = await newOwner('delete')
    const id = (await addService(owner.cookie)).json.data.id

    const deleted = await request('DELETE', `/api/shop/services/${id}`, { cookie: owner.cookie })

    expect(deleted.status).toBe(200)
    expect(deleted.json.data).toEqual({ id })
    expect((await request('GET', '/api/shop/services', { cookie: owner.cookie })).json.data).toEqual([])
    expectError(await request('DELETE', `/api/shop/services/${id}`, { cookie: owner.cookie }), 404, 'SERVICE_NOT_FOUND')
  })

  it('refuses a service with past visits, which can be archived instead', async () => {
    const owner = await newOwner('used')
    const id = (await addService(owner.cookie)).json.data.id
    const joined = await request('POST', `/api/shops/${owner.shopId}/queue`, { body: { name: 'Arjun', phone: '+919990000001', serviceId: id } })
    expect(joined.status).toBe(201)

    expectError(await request('DELETE', `/api/shop/services/${id}`, { cookie: owner.cookie }), 409, 'SERVICE_IN_USE')

    const archived = await request('PATCH', `/api/shop/services/${id}`, { cookie: owner.cookie, body: { isActive: false } })
    expect(archived.json.data).toMatchObject({ id, isActive: false })
    expect((await request('GET', `/api/shops/${owner.shopId}/services`)).json.data).toEqual([])
  })
})

describe('who may manage services', () => {
  let owner: { cookie: string, shopId: string }
  let barber: { cookie: string }
  let serviceId: string

  beforeAll(async () => {
    owner = await newOwner('roles')
    serviceId = (await addService(owner.cookie)).json.data.id
    const account = await signUp(uniqueEmail('barber'))
    await addMemberFixture(owner.shopId, account.userId, 'BARBER')
    barber = account
  })

  it('lets any member view them', async () => {
    const list = await request('GET', '/api/shop/services', { cookie: barber.cookie })
    expect(list.status).toBe(200)
    expect(list.json.data.map((service: { id: string }) => service.id)).toEqual([serviceId])
  })

  it('lets only the owner add, edit or delete (403 INSUFFICIENT_ROLE)', async () => {
    expectError(await addService(barber.cookie), 403, 'INSUFFICIENT_ROLE')
    expectError(await request('PATCH', `/api/shop/services/${serviceId}`, { cookie: barber.cookie, body: { priceMinor: 1 } }), 403, 'INSUFFICIENT_ROLE')
    expectError(await request('DELETE', `/api/shop/services/${serviceId}`, { cookie: barber.cookie }), 403, 'INSUFFICIENT_ROLE')
    expect((await request('GET', '/api/shop/services', { cookie: owner.cookie })).json.data[0]).toMatchObject({ id: serviceId, priceMinor: 15000 })
  })

  it('refuses accounts without a shop (403) and signed-out requests (401)', async () => {
    const outsider = await signUp(uniqueEmail('outsider'))
    for (const [method, path, body] of [
      ['GET', '/api/shop/services'],
      ['POST', '/api/shop/services', { name: 'X', durationMinutes: 10, priceMinor: 100 }],
      ['PATCH', `/api/shop/services/${serviceId}`, { priceMinor: 1 }],
      ['DELETE', `/api/shop/services/${serviceId}`]
    ] as const) {
      expectError(await request(method, path, { cookie: outsider.cookie, body }), 403, 'FORBIDDEN')
      expectError(await request(method, path, { body }), 401, 'UNAUTHENTICATED')
    }
  })
})
