// Real authentication over HTTP: email and phone (OTP) accounts as one
// identity, sessions, and authorization by shop role. Codes are read from the
// server's SMS file (the development sender), emails from its email file.
import { randomInt, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { useDb } from '../../db'
import { user } from '../../db/schema'
import { addMemberFixture, createShopFixture, resetDatabase, type ShopFixture } from '../fixtures'
import { baseUrl, expectError, newClientIp, request, signUp, type ApiResponse } from './http'
import { countCodes, waitForCode } from './sms'

function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@trimly.test`
}

/** A fresh Indian mobile number in E.164. */
function uniquePhone() {
  return `+919${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`
}

function cookieOf(response: ApiResponse): string {
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

function sendCode(phoneNumber: string, cookie?: string) {
  return request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber }, cookie })
}

function verifyCode(phoneNumber: string, code: string, options: { cookie?: string, updatePhoneNumber?: boolean } = {}) {
  return request('POST', '/api/auth/phone-number/verify', {
    body: { phoneNumber, code, ...(options.updatePhoneNumber ? { updatePhoneNumber: true } : {}) },
    cookie: options.cookie
  })
}

/** Sends a code and verifies it: signs in, or signs up if the number is new. */
async function phoneSignIn(phoneNumber: string): Promise<{ userId: string, cookie: string }> {
  const before = countCodes(phoneNumber)
  expect((await sendCode(phoneNumber)).status).toBe(200)
  const verified = await verifyCode(phoneNumber, await waitForCode(phoneNumber, before))
  expect(verified.status).toBe(200)
  const cookie = cookieOf(verified)
  expect(cookie).toContain('session_token')
  return { userId: verified.json.user.id, cookie }
}

async function usersWithPhone(phoneNumber: string) {
  return useDb().select({ id: user.id }).from(user).where(eq(user.phoneNumber, phoneNumber))
}

function me(cookie?: string) {
  return request('GET', '/api/me', { cookie })
}

beforeAll(async () => {
  await resetDatabase()
})

describe('email accounts', () => {
  it('signs up, verifies, and reports the current user', async () => {
    const email = uniqueEmail('current')
    const { userId, cookie } = await signUp(email, 'Arjun')

    const response = await me(cookie)
    expect(response.status).toBe(200)
    expect(response.json.data).toEqual({
      user: { id: userId, name: 'Arjun', email, phoneNumber: null },
      shop: null,
      role: null,
      memberships: []
    })
  })

  it('keeps the session across requests, for 30 days, refreshed with use', async () => {
    const { cookie } = await signUp(uniqueEmail('persist'))

    for (let index = 0; index < 3; index++) {
      expect((await me(cookie)).status).toBe(200)
    }
    const session = await request('GET', '/api/auth/get-session', { cookie })
    const daysLeft = (Date.parse(session.json.session.expiresAt) - Date.now()) / 86_400_000
    expect(daysLeft).toBeGreaterThan(29)
    expect(daysLeft).toBeLessThanOrEqual(30)
  })

  it('signs out: the session stops working everywhere it was used', async () => {
    const { cookie } = await signUp(uniqueEmail('logout'))

    const signOut = await request('POST', '/api/auth/sign-out', { cookie, body: {} })
    expect(signOut.status).toBe(200)

    expectError(await me(cookie), 401, 'UNAUTHENTICATED')
    expect((await request('GET', '/api/auth/get-session', { cookie })).json).toBeNull()
  })

  it('refuses sign-up with a placeholder address reserved for phone accounts', async () => {
    const response = await request('POST', '/api/auth/sign-up/email', {
      body: { name: 'Sneaky', email: '919876543210@phone.trimly.invalid', password: 'long-enough-password' }
    })
    expect(response.status).toBe(400)
    expect(response.json.code).toBe('INVALID_EMAIL')
  })
})

describe('phone sign-up and sign-in (OTP)', () => {
  it('signs up a new number, then signs the same account in again (no duplicate)', async () => {
    const phone = uniquePhone()

    const first = await phoneSignIn(phone)
    const meResponse = await me(first.cookie)
    expect(meResponse.status).toBe(200)
    // Phone accounts have no email (the internal placeholder is never exposed).
    expect(meResponse.json.data.user).toMatchObject({ id: first.userId, email: null, phoneNumber: phone })

    const second = await phoneSignIn(phone)
    expect(second.userId).toBe(first.userId)
    expect(await usersWithPhone(phone)).toHaveLength(1)
  })

  it('lets a new phone account set its name and create a shop', async () => {
    const { cookie } = await phoneSignIn(uniquePhone())

    expect((await request('POST', '/api/auth/update-user', { cookie, body: { name: 'Nabil' } })).status).toBe(200)
    const shop = await request('POST', '/api/onboarding/shop', {
      cookie,
      body: { name: 'Nabil Cuts', phone: '98765 43210', currency: 'INR' }
    })
    expect(shop.status).toBe(201)
    expect((await me(cookie)).json.data).toMatchObject({ user: { name: 'Nabil' }, role: 'OWNER' })
  })

  it('rejects a wrong code, and the code stops working after 3 wrong tries', async () => {
    const phone = uniquePhone()
    await sendCode(phone)
    const code = await waitForCode(phone)
    const wrong = code === '000000' ? '111111' : '000000'

    const first = await verifyCode(phone, wrong)
    expect(first.status).toBe(400)
    expect(first.json.code).toBe('INVALID_OTP')
    await verifyCode(phone, wrong)
    await verifyCode(phone, wrong)

    const late = await verifyCode(phone, code)
    expect(late.status).toBe(403)
    expect(late.json.code).toBe('TOO_MANY_ATTEMPTS')
    expect(await usersWithPhone(phone)).toHaveLength(0)
  })

  it('only texts valid numbers in allowed countries', async () => {
    for (const phoneNumber of ['+91 98765 43210', '9876543210', '+14155550100']) {
      const response = await sendCode(phoneNumber)
      expect(response.status).toBe(400)
      expect(response.json.code).toBe('INVALID_PHONE_NUMBER')
      expect(countCodes(phoneNumber)).toBe(0)
    }
  })

  it('limits codes per number, from any client (429)', async () => {
    const phone = uniquePhone()
    const statuses: number[] = []
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push((await sendCode(phone)).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('limits codes per client (429)', async () => {
    const ip = newClientIp()
    const statuses: number[] = []
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push((await request('POST', '/api/auth/phone-number/send-otp', { ip, body: { phoneNumber: uniquePhone() } })).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('does not offer phone + password sign-in or reset by phone', async () => {
    for (const path of ['/api/auth/sign-in/phone-number', '/api/auth/phone-number/request-password-reset', '/api/auth/phone-number/reset-password']) {
      // Disabled paths answer a plain-text 404.
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': baseUrl, 'x-forwarded-for': newClientIp() },
        body: JSON.stringify({ phoneNumber: uniquePhone(), password: 'whatever-password' })
      })
      expect(response.status, path).toBe(404)
    }
  })
})

describe('one identity: adding a phone to an email account', () => {
  it('adds a verified phone, then phone sign-in reaches the same account', async () => {
    const { userId, cookie } = await signUp(uniqueEmail('both'))
    const phone = uniquePhone()

    await sendCode(phone, cookie)
    const added = await verifyCode(phone, await waitForCode(phone), { cookie, updatePhoneNumber: true })
    expect(added.status).toBe(200)
    expect((await me(cookie)).json.data.user.phoneNumber).toBe(phone)

    const viaPhone = await phoneSignIn(phone)
    expect(viaPhone.userId).toBe(userId)
    expect(await usersWithPhone(phone)).toHaveLength(1)
  })

  it('refuses a number that belongs to another account', async () => {
    const phone = uniquePhone()
    const holder = await phoneSignIn(phone)
    const { cookie } = await signUp(uniqueEmail('claimer'))

    const before = countCodes(phone)
    await sendCode(phone, cookie)
    const response = await verifyCode(phone, await waitForCode(phone, before), { cookie, updatePhoneNumber: true })
    expect(response.status).toBe(400)
    expect(response.json.code).toBe('PHONE_NUMBER_EXIST')
    expect(await usersWithPhone(phone)).toEqual([{ id: holder.userId }])
  })

  it('never sets a phone number without a code', async () => {
    const phone = uniquePhone()

    const signUpWithPhone = await request('POST', '/api/auth/sign-up/email', {
      body: { name: 'Sneaky', email: uniqueEmail('sneaky'), password: 'long-enough-password', phoneNumber: phone }
    })
    expect(signUpWithPhone.status).toBe(400)
    expect(signUpWithPhone.json.code).toBe('PHONE_NUMBER_NOT_EDITABLE')

    const { cookie } = await signUp(uniqueEmail('updater'))
    const update = await request('POST', '/api/auth/update-user', { cookie, body: { phoneNumber: phone } })
    expect(update.status).toBe(400)
    expect(update.json.code).toBe('PHONE_NUMBER_NOT_EDITABLE')

    expect(await usersWithPhone(phone)).toHaveLength(0)
  })
})

describe('authorization by shop role', () => {
  let shop: ShopFixture
  let owner: { cookie: string }
  let barber: { cookie: string }
  let outsider: { cookie: string }

  beforeAll(async () => {
    const ownerAccount = await signUp(uniqueEmail('role-owner'))
    shop = await createShopFixture({ ownerUserId: ownerAccount.userId, slug: `roles-${randomUUID().slice(0, 6)}` })
    // A barber signed in by phone: same session and rules as email.
    const barberAccount = await phoneSignIn(uniquePhone())
    await addMemberFixture(shop.shopId, barberAccount.userId, 'BARBER')
    owner = ownerAccount
    barber = barberAccount
    outsider = await signUp(uniqueEmail('role-outsider'))
  })

  const OWNER_ONLY: [method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown][] = [
    ['POST', '/api/shop/services', { name: 'Shave', durationMinutes: 15, priceMinor: 8000 }],
    ['PATCH', '/api/dashboard/shop', { serviceBufferMinutes: 10 }],
    ['PUT', '/api/dashboard/hours', { days: [] }],
    ['GET', '/api/reports?period=day']
  ]
  const ANY_MEMBER: [method: 'GET', path: string][] = [
    ['GET', '/api/dashboard'],
    ['GET', '/api/dashboard/hours'],
    ['GET', '/api/dashboard/notifications'],
    ['GET', '/api/dashboard/appointments?from=2026-10-01&to=2026-10-02'],
    ['GET', '/api/shop/services']
  ]

  it('reports the member\'s role', async () => {
    expect((await me(barber.cookie)).json.data).toMatchObject({ role: 'BARBER', shop: { id: shop.shopId } })
    expect((await request('GET', '/api/dashboard', { cookie: barber.cookie })).json.data.member.role).toBe('BARBER')
  })

  it('lets a barber run the queue', async () => {
    const walkIn = await request('POST', `/api/shops/${shop.shopId}/queue`, {
      cookie: barber.cookie,
      body: { name: 'Walk-in', serviceId: shop.services.haircut }
    })
    expect(walkIn.status).toBe(201)
    const entryId = walkIn.json.data.entry.id

    expect((await request('POST', `/api/queue/${entryId}/start`, { cookie: barber.cookie })).status).toBe(200)
    expect((await request('POST', `/api/queue/${entryId}/complete`, { cookie: barber.cookie, body: {} })).status).toBe(200)
    // The full queue (customer details), not the public one.
    const queue = await request('GET', `/api/shops/${shop.shopId}/queue`, { cookie: barber.cookie })
    expect(queue.status).toBe(200)

    for (const [method, path] of ANY_MEMBER) {
      expect((await request(method, path, { cookie: barber.cookie })).status, `${method} ${path}`).toBe(200)
    }
  })

  it('keeps owner-only actions from barbers (403 INSUFFICIENT_ROLE)', async () => {
    for (const [method, path, body] of OWNER_ONLY) {
      const response = await request(method, path, { cookie: barber.cookie, body })
      expect(response.status, `${method} ${path}`).toBe(403)
      expect(response.json.error.code, `${method} ${path}`).toBe('INSUFFICIENT_ROLE')
    }
    // Nothing changed.
    expect((await request('GET', '/api/dashboard', { cookie: owner.cookie })).json.data.shop.isOpen).toBe(true)
  })

  it('lets the owner do owner-only actions', async () => {
    for (const [method, path, body] of OWNER_ONLY) {
      const response = await request(method, path, { cookie: owner.cookie, body })
      expect([401, 403], `${method} ${path}`).not.toContain(response.status)
    }
  })

  it('refuses accounts without a shop (403) and signed-out requests (401)', async () => {
    for (const [method, path, body] of [...OWNER_ONLY, ...ANY_MEMBER]) {
      expectError(await request(method, path, { cookie: outsider.cookie, body }), 403, 'FORBIDDEN')
      expectError(await request(method, path, { body }), 401, 'UNAUTHENTICATED')
    }
    expectError(await me(), 401, 'UNAUTHENTICATED')
  })

  it('treats a member of another shop as public on this shop\'s pages', async () => {
    const other = await signUp(uniqueEmail('other-owner'))
    await createShopFixture({ ownerUserId: other.userId, slug: `other-${randomUUID().slice(0, 6)}` })

    // Not a walk-in: an online join, which needs a phone.
    const join = await request('POST', `/api/shops/${shop.shopId}/queue`, { cookie: other.cookie, body: { name: 'Other', serviceId: shop.services.beard } })
    expectError(join, 400, 'PHONE_REQUIRED')
  })

  it('never takes the shop or user from the request', async () => {
    const response = await request('POST', '/api/shop/services', {
      cookie: owner.cookie,
      body: { name: 'Shave', durationMinutes: 15, priceMinor: 8000, shopId: randomUUID() }
    })
    expectError(response, 400, 'VALIDATION_ERROR')
  })
})
