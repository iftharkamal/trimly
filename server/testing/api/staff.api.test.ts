// Staff management over HTTP: /api/shop/staff. A barber is a chair in the
// queue worked by a shop member; the owner adds them by name and mobile, and
// they get access by verifying that number (OTP), as in the app.
import { randomInt, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createShopFixture, resetDatabase } from '../fixtures'
import { expectError, request, signUp, type ApiResponse } from './http'
import { countCodes, waitForCode } from './sms'

const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@trimly.test`
const uniqueMobile = () => `+919${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`
const cookieOf = (response: ApiResponse) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

/** Signs in (or up) with a code texted to the number, like the app's phone tab. */
async function phoneSignIn(phoneNumber: string) {
  const before = countCodes(phoneNumber)
  await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber } })
  const verified = await request('POST', '/api/auth/phone-number/verify', { body: { phoneNumber, code: await waitForCode(phoneNumber, before) } })
  return { cookie: cookieOf(verified), userId: verified.json.user.id as string }
}

let owner: { cookie: string, shopId: string }

beforeAll(async () => {
  await resetDatabase()
  const account = await signUp(uniqueEmail('owner'), 'Faisal')
  const shop = await request('POST', '/api/onboarding/shop', { cookie: account.cookie, body: { name: 'Staff Cuts', phone: '98765 43210', currency: 'INR' } })
  owner = { cookie: account.cookie, shopId: shop.json.data.id }
})

const staff = async () => (await request('GET', '/api/shop/staff', { cookie: owner.cookie })).json.data as { id: string, name: string, role: string | null, status: string, waiting: number, isActive: boolean, account: { status: string } }[]

describe('the owner\'s staff', () => {
  it('starts with the owner\'s own chair', async () => {
    expect(await staff()).toEqual([
      expect.objectContaining({ name: 'Faisal', role: 'OWNER', isActive: true, status: 'AVAILABLE', waiting: 0, account: expect.objectContaining({ status: 'LINKED' }) })
    ])
  })

  it('adds a barber who gets access by signing up with their mobile', async () => {
    const mobile = uniqueMobile()
    const added = await request('POST', '/api/shop/staff', { cookie: owner.cookie, body: { name: 'Arjun', phone: mobile.slice(3) } })

    expect(added.status).toBe(201)
    expect(added.json.data).toMatchObject({ name: 'Arjun', role: null, invitePhone: mobile, isActive: true, status: 'AVAILABLE', account: { status: 'INVITED' } })
    // Takes customers straight away.
    expect((await request('GET', '/api/dashboard', { cookie: owner.cookie })).json.data.barbers.map((barber: { name: string }) => barber.name)).toContain('Arjun')

    const arjun = await phoneSignIn(mobile)
    const me = (await request('GET', '/api/me', { cookie: arjun.cookie })).json.data
    expect(me).toMatchObject({ role: 'BARBER', shop: { id: owner.shopId } })
    expect((await request('GET', '/api/dashboard', { cookie: arjun.cookie })).status).toBe(200)
    expect((await staff()).find(member => member.name === 'Arjun')).toMatchObject({ role: 'BARBER', account: { status: 'LINKED' } })
    // A barber doesn't manage staff.
    expectError(await request('GET', '/api/shop/staff', { cookie: arjun.cookie }), 403, 'INSUFFICIENT_ROLE')
  })

  it('links someone who already has an account straight away', async () => {
    const mobile = uniqueMobile()
    const nabil = await phoneSignIn(mobile)
    expect((await request('GET', '/api/me', { cookie: nabil.cookie })).json.data.shop).toBeNull()

    const added = await request('POST', '/api/shop/staff', { cookie: owner.cookie, body: { name: 'Nabil', phone: mobile } })

    expect(added.json.data).toMatchObject({ role: 'BARBER', account: { status: 'LINKED', phoneNumber: mobile } })
    expect((await request('GET', '/api/me', { cookie: nabil.cookie })).json.data).toMatchObject({ role: 'BARBER', shop: { id: owner.shopId } })
  })

  it('shows each barber\'s status as the queue moves', async () => {
    const barber = (await request('POST', '/api/shop/staff', { cookie: owner.cookie, body: { name: 'Sameer', phone: uniqueMobile() } })).json.data
    const service = (await request('POST', '/api/shop/services', { cookie: owner.cookie, body: { name: 'Haircut', durationMinutes: 20, priceMinor: 15000 } })).json.data

    const joined = await request('POST', `/api/shops/${owner.shopId}/queue`, { cookie: owner.cookie, body: { name: 'Walk-in', serviceId: service.id, barberId: barber.id } })
    expect((await staff()).find(member => member.id === barber.id)).toMatchObject({ status: 'AVAILABLE', waiting: 1 })

    await request('POST', `/api/queue/${joined.json.data.entry.id}/start`, { cookie: owner.cookie })
    expect((await staff()).find(member => member.id === barber.id)).toMatchObject({ status: 'SERVING', waiting: 0 })

    // Can't be deactivated mid-service.
    expectError(await request('PATCH', `/api/shop/staff/${barber.id}`, { cookie: owner.cookie, body: { isActive: false } }), 409, 'BARBER_HAS_CUSTOMERS')
    await request('POST', `/api/queue/${joined.json.data.entry.id}/complete`, { cookie: owner.cookie, body: {} })
    expect((await staff()).find(member => member.id === barber.id)).toMatchObject({ status: 'AVAILABLE', waiting: 0 })
  })

  it('deactivates a barber (no customers, no access) and reactivates them', async () => {
    const mobile = uniqueMobile()
    const barber = (await request('POST', '/api/shop/staff', { cookie: owner.cookie, body: { name: 'Riya', phone: mobile } })).json.data
    const riya = await phoneSignIn(mobile)
    expect((await request('GET', '/api/dashboard', { cookie: riya.cookie })).status).toBe(200)

    const off = await request('PATCH', `/api/shop/staff/${barber.id}`, { cookie: owner.cookie, body: { isActive: false } })
    expect(off.json.data).toMatchObject({ isActive: false, status: 'INACTIVE', role: null })
    expectError(await request('GET', '/api/dashboard', { cookie: riya.cookie }), 403, 'FORBIDDEN')
    expect((await request('GET', '/api/dashboard', { cookie: owner.cookie })).json.data.barbers.map((b: { id: string }) => b.id)).not.toContain(barber.id)

    const on = await request('PATCH', `/api/shop/staff/${barber.id}`, { cookie: owner.cookie, body: { isActive: true, name: 'Riya K' } })
    expect(on.json.data).toMatchObject({ name: 'Riya K', isActive: true, role: 'BARBER', account: { status: 'LINKED' } })
    expect((await request('GET', '/api/dashboard', { cookie: riya.cookie })).status).toBe(200)
  })
})

describe('staff rules', () => {
  it('validates input and never takes the shop, role or account from the body', async () => {
    for (const [body, code] of [
      [{ name: '', phone: uniqueMobile() }, 'VALIDATION_ERROR'],
      [{ name: 'X', phone: '12345' }, 'VALIDATION_ERROR'],
      [{ name: 'X', phone: '+14155550100' }, 'VALIDATION_ERROR'],
      [{ name: 'X', phone: uniqueMobile(), role: 'OWNER' }, 'VALIDATION_ERROR'],
      [{ name: 'X', phone: uniqueMobile(), shopId: owner.shopId }, 'VALIDATION_ERROR'],
      [{ name: 'X', phone: uniqueMobile(), userId: 'someone' }, 'VALIDATION_ERROR']
    ] as const) {
      expectError(await request('POST', '/api/shop/staff', { cookie: owner.cookie, body }), 400, code)
    }
  })

  it('refuses the same number twice', async () => {
    const mobile = uniqueMobile()
    await request('POST', '/api/shop/staff', { cookie: owner.cookie, body: { name: 'Once', phone: mobile } })
    expectError(await request('POST', '/api/shop/staff', { cookie: owner.cookie, body: { name: 'Twice', phone: mobile } }), 409, 'ALREADY_STAFF')
  })

  it('only lets the owner change their own shop\'s staff', async () => {
    const other = await createShopFixture({ slug: `other-${randomUUID().slice(0, 6)}` })
    expectError(await request('PATCH', `/api/shop/staff/${other.barberId}`, { cookie: owner.cookie, body: { name: 'Hijacked' } }), 404, 'BARBER_NOT_FOUND')

    const outsider = await signUp(uniqueEmail('outsider'))
    for (const [method, path, body] of [
      ['GET', '/api/shop/staff'],
      ['POST', '/api/shop/staff', { name: 'X', phone: uniqueMobile() }],
      ['PATCH', `/api/shop/staff/${other.barberId}`, { name: 'X' }]
    ] as const) {
      expectError(await request(method, path, { cookie: outsider.cookie, body }), 403, 'FORBIDDEN')
      expectError(await request(method, path, { body }), 401, 'UNAUTHENTICATED')
    }
  })
})
