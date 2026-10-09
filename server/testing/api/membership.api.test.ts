// Shop membership over HTTP: user → membership → shop, for every role and for
// a person in several shops (allowed by the model; choosing isn't in the UI yet).
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMemberFixture, createShopFixture, resetDatabase, type ShopFixture } from '../fixtures'
import { baseUrl, expectError, newClientIp, request, signUp } from './http'

const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@trimly.test`
const slug = (label: string) => `${label}-${randomUUID().slice(0, 6)}`

beforeAll(async () => {
  await resetDatabase()
})

describe('a receptionist', () => {
  let shop: ShopFixture
  let receptionist: { cookie: string }

  beforeAll(async () => {
    shop = await createShopFixture({ slug: slug('front-desk') })
    const account = await signUp(uniqueEmail('receptionist'), 'Meera')
    await addMemberFixture(shop.shopId, account.userId, 'RECEPTIONIST')
    receptionist = account
  })

  it('is told their role', async () => {
    expect((await request('GET', '/api/me', { cookie: receptionist.cookie })).json.data).toMatchObject({ role: 'RECEPTIONIST', shop: { id: shop.shopId } })
    const dashboard = (await request('GET', '/api/dashboard', { cookie: receptionist.cookie })).json.data
    expect(dashboard.member).toEqual({ name: 'Meera', role: 'RECEPTIONIST' })
    // The shop's owner is someone else (from shop_members), not the signed-in member.
    expect(dashboard.owner).toEqual({ name: 'Test Owner' })
    expect(dashboard.shop.id).toBe(shop.shopId)
  })

  it('runs the front desk: walk-ins, the queue, appointments', async () => {
    const walkIn = await request('POST', `/api/shops/${shop.shopId}/queue`, { cookie: receptionist.cookie, body: { name: 'Walk-in', serviceId: shop.services.haircut } })
    expect(walkIn.status).toBe(201)
    const entryId = walkIn.json.data.entry.id
    expect((await request('POST', `/api/queue/${entryId}/start`, { cookie: receptionist.cookie })).status).toBe(200)
    expect((await request('POST', `/api/queue/${entryId}/complete`, { cookie: receptionist.cookie, body: { payment: { method: 'UPI', amountMinor: 15000 } } })).status).toBe(200)
    expect((await request('GET', '/api/dashboard/appointments?from=2026-10-01&to=2026-10-02', { cookie: receptionist.cookie })).status).toBe(200)
  })

  it('can\'t do owner-only things', async () => {
    for (const [method, path, body] of [['GET', '/api/reports?period=day'], ['GET', '/api/dashboard/services'], ['PATCH', '/api/dashboard/shop', { isOpen: false }]] as const) {
      expectError(await request(method, path, { cookie: receptionist.cookie, body }), 403, 'INSUFFICIENT_ROLE')
    }
  })
})

describe('a person in several shops', () => {
  let first: ShopFixture
  let second: ShopFixture
  let person: { userId: string, cookie: string }

  beforeAll(async () => {
    first = await createShopFixture({ slug: slug('first') })
    second = await createShopFixture({ slug: slug('second') })
    person = await signUp(uniqueEmail('two-shops'), 'Arjun')
    await addMemberFixture(first.shopId, person.userId, 'BARBER')
    await addMemberFixture(second.shopId, person.userId, 'RECEPTIONIST')
  })

  it('sees every shop they belong to, with no current one chosen', async () => {
    const me = (await request('GET', '/api/me', { cookie: person.cookie })).json.data
    expect(me.shop).toBeNull()
    expect(me.role).toBeNull()
    expect(me.memberships).toEqual([
      { shop: expect.objectContaining({ id: first.shopId }), role: 'BARBER' },
      { shop: expect.objectContaining({ id: second.shopId }), role: 'RECEPTIONIST' }
    ])
  })

  it('gets 409 SHOP_SELECTION_REQUIRED where the shop would have to be guessed', async () => {
    expectError(await request('GET', '/api/dashboard', { cookie: person.cookie }), 409, 'SHOP_SELECTION_REQUIRED')

    const dashboard = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual', headers: { cookie: person.cookie, 'x-forwarded-for': newClientIp() } })
    expect(dashboard.status).toBe(409)
  })

  it('acts as a member of each shop where the shop is in the URL', async () => {
    for (const shop of [first, second]) {
      expect((await request('GET', `/api/shops/${shop.shopId}/queue`, { cookie: person.cookie })).json.data.view).toBe('owner')
    }
    // Not a member: the public view.
    const stranger = await createShopFixture({ slug: slug('stranger') })
    expect((await request('GET', `/api/shops/${stranger.shopId}/queue`, { cookie: person.cookie })).json.data.view).toBe('public')
  })
})

describe('creating a shop', () => {
  it('makes the creator its OWNER', async () => {
    const { cookie } = await signUp(uniqueEmail('creator'))
    const created = await request('POST', '/api/onboarding/shop', {
      cookie,
      body: { name: 'Kochi Cuts', phone: '98765 43210', currency: 'INR' }
    })
    expect(created.status).toBe(201)
    expect((await request('GET', '/api/me', { cookie })).json.data).toMatchObject({ role: 'OWNER', shop: { id: created.json.data.id }, memberships: [{ role: 'OWNER' }] })
  })

  it('is refused (for now) to someone who already belongs to a shop', async () => {
    const shop = await createShopFixture({ slug: slug('employer') })
    const barber = await signUp(uniqueEmail('barber'))
    await addMemberFixture(shop.shopId, barber.userId, 'BARBER')

    expectError(await request('POST', '/api/onboarding/shop', {
      cookie: barber.cookie,
      body: { name: 'My Own', phone: '98765 43210', currency: 'INR' }
    }), 409, 'ALREADY_HAS_SHOP')
  })
})
