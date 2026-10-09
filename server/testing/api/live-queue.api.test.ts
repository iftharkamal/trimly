// The live queue end to end over HTTP: positions and ETAs are the server's,
// from service durations and the shop's (configurable) gap between customers;
// the queue advances as barbers start and complete.
import { randomInt, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { resetDatabase } from '../fixtures'
import { expectError, request, signUp, type ApiResponse } from './http'
import { countCodes, waitForCode } from './sms'

const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@trimly.test`
const uniqueMobile = () => `+919${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`
const cookieOf = (response: ApiResponse) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

async function newShop(label: string) {
  const owner = await signUp(uniqueEmail(label), 'Faisal')
  const shop = (await request('POST', '/api/onboarding/shop', { cookie: owner.cookie, body: { name: `${label} Cuts`, phone: '98765 43210', currency: 'INR' } })).json.data
  const haircut = (await request('POST', '/api/shop/services', { cookie: owner.cookie, body: { name: 'Haircut', durationMinutes: 20, priceMinor: 15000 } })).json.data
  return { cookie: owner.cookie, shopId: shop.id as string, haircutId: haircut.id as string }
}

function join(shopId: string, serviceId: string, name: string) {
  return request('POST', `/api/shops/${shopId}/queue`, { body: { name, phone: uniqueMobile(), serviceId } })
}

beforeAll(async () => {
  await resetDatabase()
})

describe('the gap between customers', () => {
  it('starts at 5 minutes and changes every ETA at once, for staff and customers', async () => {
    const shop = await newShop('buffer')
    await join(shop.shopId, shop.haircutId, 'First')
    const second = (await join(shop.shopId, shop.haircutId, 'Second')).json.data
    // 20-minute haircut ahead + 5-minute gap.
    expect(second.entry).toMatchObject({ position: 2, waitMinutes: 25 })

    for (const [minutes, expected] of [[0, 20], [15, 35]] as const) {
      const updated = await request('PATCH', '/api/dashboard/shop', { cookie: shop.cookie, body: { serviceBufferMinutes: minutes } })
      expect(updated.json.data.serviceBufferMinutes).toBe(minutes)
      // The customer's tracking link and the staff queue agree.
      expect((await request('GET', `/api/track/${second.trackingCode}`)).json.data).toMatchObject({ position: 2, waitMinutes: expected })
      const lane = (await request('GET', `/api/shops/${shop.shopId}/queue`, { cookie: shop.cookie })).json.data.barbers[0]
      expect(lane.waiting[1]).toMatchObject({ position: 2, waitMinutes: expected })
    }
    expect((await request('GET', '/api/me', { cookie: shop.cookie })).json.data.shop.serviceBufferMinutes).toBe(15)
  })

  it('accepts whole minutes from 0 to 60, from the owner only', async () => {
    const shop = await newShop('picky')
    for (const serviceBufferMinutes of [-1, 61, 2.5, '10', null]) {
      expectError(await request('PATCH', '/api/dashboard/shop', { cookie: shop.cookie, body: { serviceBufferMinutes } }), 400, 'VALIDATION_ERROR')
    }
    expectError(await request('PATCH', '/api/dashboard/shop', { cookie: shop.cookie, body: {} }), 400, 'VALIDATION_ERROR')
    expectError(await request('PATCH', '/api/dashboard/shop', { body: { serviceBufferMinutes: 10 } }), 401, 'UNAUTHENTICATED')
  })
})

describe('the queue moving', () => {
  it('advances and recalculates as the barber starts and completes', async () => {
    const shop = await newShop('moving')
    await request('PATCH', '/api/dashboard/shop', { cookie: shop.cookie, body: { serviceBufferMinutes: 0 } })
    // One after another, so the queue order is certain.
    const a = (await join(shop.shopId, shop.haircutId, 'A')).json.data
    const b = (await join(shop.shopId, shop.haircutId, 'B')).json.data
    const c = (await join(shop.shopId, shop.haircutId, 'C')).json.data
    const track = async (code: string) => (await request('GET', `/api/track/${code}`)).json.data

    expect(await track(c.trackingCode)).toMatchObject({ position: 3, customersAhead: 2, waitMinutes: 40 })

    expect((await request('POST', `/api/queue/${a.entry.id}/start`, { cookie: shop.cookie })).status).toBe(200)
    expect(await track(a.trackingCode)).toMatchObject({ status: 'IN_PROGRESS' })
    // Next in line; the customer in the chair still counts as ahead.
    expect(await track(b.trackingCode)).toMatchObject({ position: 1, customersAhead: 1, waitMinutes: 20, state: 'YOU_ARE_NEXT' })
    expect(await track(c.trackingCode)).toMatchObject({ position: 2, waitMinutes: 40 })
    // One customer at a time per barber.
    expectError(await request('POST', `/api/queue/${b.entry.id}/start`, { cookie: shop.cookie }), 409, 'BARBER_BUSY')

    expect((await request('POST', `/api/queue/${a.entry.id}/complete`, { cookie: shop.cookie, body: {} })).status).toBe(200)
    expect(await track(a.trackingCode)).toMatchObject({ status: 'COMPLETED' })
    expect(await track(b.trackingCode)).toMatchObject({ position: 1, waitMinutes: 0 })
    expect(await track(c.trackingCode)).toMatchObject({ position: 2, waitMinutes: 20 })
  })
})

describe('a barber\'s own chair', () => {
  it('is reported to whoever works it', async () => {
    const shop = await newShop('chairs')
    const staff = async () => (await request('GET', '/api/shop/staff', { cookie: shop.cookie })).json.data as { id: string, role: string | null }[]
    const ownerChair = (await staff()).find(member => member.role === 'OWNER')!
    expect((await request('GET', '/api/dashboard', { cookie: shop.cookie })).json.data.member.barberId).toBe(ownerChair.id)

    const mobile = uniqueMobile()
    const added = (await request('POST', '/api/shop/staff', { cookie: shop.cookie, body: { name: 'Arjun', phone: mobile } })).json.data
    const before = countCodes(mobile)
    await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: mobile } })
    const verified = await request('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: mobile, code: await waitForCode(mobile, before) } })

    expect((await request('GET', '/api/dashboard', { cookie: cookieOf(verified) })).json.data.member).toMatchObject({ role: 'BARBER', barberId: added.id })
  })
})
