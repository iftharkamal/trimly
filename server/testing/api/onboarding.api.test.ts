// Milestone 1 over real HTTP: sign-up with email verification, password
// reset, shop onboarding and services management. Emails are read from the
// server's email file (EMAIL_PROVIDER=file), so the real links are followed.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { useDb } from '../../db'
import { rateLimit } from '../../db/schema'
import { resetDatabase } from '../fixtures'
import { countEmails, linkIn, waitForEmail } from './emails'
import { baseUrl, cookieFrom, expectError, newClientIp, request, signIn, signUp, TEST_PASSWORD } from './http'

function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@trimly.test`
}

function shopBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Kochi Cuts',
    phone: '98765 43210',
    address: 'MG Road, Kochi',
    currency: 'INR',
    ...overrides
  }
}

async function waitForCount(email: string, subject: string, count: number) {
  const deadline = Date.now() + 5000
  while (countEmails(email, subject) < count && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  expect(countEmails(email, subject)).toBe(count)
}

beforeAll(async () => {
  await resetDatabase()
})

describe('sign-up and email verification', () => {
  it('blocks sign-in until the email is verified, then the emailed link signs the user in', async () => {
    const email = uniqueEmail('new')
    const signUpResponse = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': baseUrl, 'x-forwarded-for': newClientIp() },
      body: JSON.stringify({ name: 'Nabil', email, password: TEST_PASSWORD, callbackURL: '/' })
    })
    expect(signUpResponse.status).toBe(200)
    expect(cookieFrom(signUpResponse)).not.toContain('session_token')
    await waitForCount(email, 'Verify your email', 1)

    // Not verified: refused, and a fresh link is sent.
    const attempt = await signIn(email)
    expect(attempt.status).toBe(403)
    expect((await attempt.json()).code).toBe('EMAIL_NOT_VERIFIED')
    expect(cookieFrom(attempt)).not.toContain('session_token')
    await waitForCount(email, 'Verify your email', 2)

    const verified = await fetch(linkIn(await waitForEmail(email, 'Verify your email')), {
      redirect: 'manual',
      headers: { 'x-forwarded-for': newClientIp() }
    })
    const cookie = cookieFrom(verified)
    expect(cookie).toContain('session_token')

    const me = await request('GET', '/api/me', { cookie })
    expect(me.status).toBe(200)
    expect(me.json.data).toMatchObject({ user: { name: 'Nabil', email }, shop: null })
    expect((await signIn(email)).status).toBe(200)
  })

  it('rejects passwords shorter than 8 characters', async () => {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': baseUrl, 'x-forwarded-for': newClientIp() },
      body: JSON.stringify({ name: 'Short', email: uniqueEmail('short'), password: 'short' })
    })
    expect(response.status).toBe(400)
  })
})

describe('rate limiting', () => {
  it('limits sign-in attempts per client, without blocking other clients', async () => {
    const email = uniqueEmail('limited')
    await signUp(email)
    const attacker = newClientIp()

    const statuses: number[] = []
    for (let attempt = 0; attempt < 5; attempt++) {
      statuses.push((await signIn(email, 'wrong-password', attacker)).status)
    }
    expect(statuses).toContain(429)

    // Someone else can still sign in.
    expect((await signIn(email, TEST_PASSWORD, newClientIp())).status).toBe(200)
  })

  it('ignores client-supplied X-Forwarded-For entries in front of the proxy\'s own', async () => {
    const email = uniqueEmail('spoofer')
    await signUp(email)
    const attacker = newClientIp()

    // The client invents a new first entry each time; the proxy appends the real address.
    const statuses: number[] = []
    for (let attempt = 0; attempt < 5; attempt++) {
      statuses.push((await signIn(email, 'wrong-password', `${newClientIp()}, ${attacker}`)).status)
    }
    expect(statuses).toContain(429)
  })

  it('keeps the counters in the database', async () => {
    const email = uniqueEmail('stored')
    await signUp(email)
    await signIn(email, 'wrong-password', newClientIp())

    const rows = await useDb().select().from(rateLimit)
    expect(rows.some(row => row.key.includes('/sign-in/email'))).toBe(true)
  })
})

describe('signing out other devices', () => {
  it('ends every other session and keeps this one', async () => {
    const email = uniqueEmail('devices')
    const { cookie: phone } = await signUp(email)
    const laptop = cookieFrom(await signIn(email))

    const revoked = await request('POST', '/api/auth/revoke-other-sessions', { cookie: laptop, body: {} })
    expect(revoked.status).toBe(200)

    expect((await request('GET', '/api/me', { cookie: laptop })).status).toBe(200)
    expectError(await request('GET', '/api/me', { cookie: phone }), 401, 'UNAUTHENTICATED')
  })

  it('needs a session', async () => {
    expect((await request('POST', '/api/auth/revoke-other-sessions', { body: {} })).status).toBe(401)
  })
})

describe('password reset', () => {
  it('resets through the emailed link; the old password and other sessions stop working', async () => {
    const email = uniqueEmail('reset')
    const { cookie: oldSession } = await signUp(email)

    const requested = await request('POST', '/api/auth/request-password-reset', { body: { email, redirectTo: '/reset-password' } })
    expect(requested.status).toBe(200)

    // The link redirects to our page with the token.
    const link = linkIn(await waitForEmail(email, 'Reset your Trimly password'))
    const redirect = await fetch(link, { redirect: 'manual', headers: { 'x-forwarded-for': newClientIp() } })
    const location = new URL(redirect.headers.get('location') ?? '', baseUrl)
    expect(location.pathname).toBe('/reset-password')
    const token = location.searchParams.get('token')
    expect(token).toBeTruthy()

    const reset = await request('POST', '/api/auth/reset-password', { body: { newPassword: 'a-brand-new-password', token } })
    expect(reset.status).toBe(200)

    expect((await signIn(email)).status).toBe(401)
    expect((await signIn(email, 'a-brand-new-password')).status).toBe(200)
    expectError(await request('GET', '/api/me', { cookie: oldSession }), 401, 'UNAUTHENTICATED')
  })

  it('answers the same whether or not the email has an account', async () => {
    const unknown = await request('POST', '/api/auth/request-password-reset', {
      body: { email: uniqueEmail('nobody'), redirectTo: '/reset-password' }
    })
    expect(unknown.status).toBe(200)
  })
})

describe('shop onboarding', () => {
  it('requires a signed-in user', async () => {
    expectError(await request('GET', '/api/me'), 401, 'UNAUTHENTICATED')
    expectError(await request('POST', '/api/onboarding/shop', { body: shopBody() }), 401, 'UNAUTHENTICATED')
  })

  it('creates the shop with the user as OWNER, and returns it', async () => {
    const { cookie } = await signUp(uniqueEmail('owner'), 'Arjun Nair')

    const created = await request('POST', '/api/onboarding/shop', { body: shopBody({ timezone: 'Asia/Dubai', currency: 'aed' }), cookie })

    expect(created.status).toBe(201)
    expect(created.json.data).toEqual({
      id: expect.any(String),
      name: 'Kochi Cuts',
      // Generated from the name.
      slug: expect.stringMatching(/^kochi-cuts(-[a-z2-9]{4})?$/),
      phone: '+919876543210',
      address: 'MG Road, Kochi',
      timezone: 'Asia/Dubai',
      currency: 'AED',
      isOpen: true
    })
    const me = (await request('GET', '/api/me', { cookie })).json.data
    expect(me).toMatchObject({ role: 'OWNER', shop: { id: created.json.data.id }, memberships: [{ role: 'OWNER' }] })
    // Ready to use: the owner is the first barber, with default opening hours.
    const dashboard = await request('GET', '/api/dashboard', { cookie })
    expect(dashboard.json.data.barbers).toEqual([expect.objectContaining({ name: 'Arjun Nair' })])
    const hours = await request('GET', '/api/dashboard/hours', { cookie })
    expect(hours.json.data.days.filter((day: { ranges: unknown[] }) => day.ranges.length > 0)).toHaveLength(6)
  })

  it('defaults the timezone to India and treats an empty address as none', async () => {
    const { cookie } = await signUp(uniqueEmail('defaults'))
    const created = await request('POST', '/api/onboarding/shop', { body: { name: 'Plain Cuts', phone: '+91 484 234 5678', currency: 'INR' }, cookie })
    expect(created.json.data).toMatchObject({ timezone: 'Asia/Kolkata', phone: '+914842345678', address: null })
  })

  it('creates one shop however many times it is submitted', async () => {
    const { cookie } = await signUp(uniqueEmail('double-click'))

    // Five at once (a double-click, a flaky network retrying), then once more later.
    const responses = await Promise.all(Array.from({ length: 5 }, () => request('POST', '/api/onboarding/shop', { body: shopBody(), cookie })))
    expect(responses.filter(response => response.status === 201)).toHaveLength(1)
    for (const response of responses.filter(response => response.status !== 201)) {
      expectError(response, 409, 'ALREADY_HAS_SHOP')
    }
    expectError(await request('POST', '/api/onboarding/shop', { body: shopBody(), cookie }), 409, 'ALREADY_HAS_SHOP')
    expect((await request('GET', '/api/me', { cookie })).json.data.memberships).toHaveLength(1)
  })

  it('validates the shop details, field by field', async () => {
    const { cookie, userId } = await signUp(uniqueEmail('picky'))
    for (const [invalid, field] of [
      [{ name: '' }, 'name'],
      [{ name: 'x'.repeat(61) }, 'name'],
      [{ phone: '' }, 'phone'],
      [{ phone: '12345' }, 'phone'],
      [{ phone: '484 234 5678' }, 'phone'],
      [{ address: 'x'.repeat(201) }, 'address'],
      [{ currency: 'XYZ' }, 'currency'],
      [{ timezone: 'Mars/Olympus' }, 'timezone']
    ] as const) {
      const response = await request('POST', '/api/onboarding/shop', { body: shopBody(invalid), cookie })
      expectError(response, 400, 'VALIDATION_ERROR')
      expect(response.json.error.details.map((detail: { path: string }) => detail.path), field).toContain(field)
    }
    // The owner, the link name and the barber are not the client's to choose.
    for (const extra of [{ ownerUserId: userId }, { slug: 'my-link' }, { barberName: 'Someone' }, { role: 'OWNER' }]) {
      expectError(await request('POST', '/api/onboarding/shop', { body: shopBody(extra), cookie }), 400, 'VALIDATION_ERROR')
    }
    expect((await request('GET', '/api/me', { cookie })).json.data.memberships).toEqual([])
  })

  it('gives shops with the same name different links', async () => {
    const first = await signUp(uniqueEmail('first'))
    const second = await signUp(uniqueEmail('second'))
    const name = `Twin Cuts ${randomUUID().slice(0, 4)}`

    const a = (await request('POST', '/api/onboarding/shop', { body: shopBody({ name }), cookie: first.cookie })).json.data
    const b = (await request('POST', '/api/onboarding/shop', { body: shopBody({ name }), cookie: second.cookie })).json.data

    expect(a.slug).not.toBe(b.slug)
    expect(b.slug.startsWith(a.slug)).toBe(true)
  })
})

describe('services management', () => {
  async function ownerWithShop() {
    const owner = await signUp(uniqueEmail('services'))
    const shop = await request('POST', '/api/onboarding/shop', { body: shopBody(), cookie: owner.cookie })
    return { ...owner, shopId: shop.json.data.id as string }
  }

  it('adds, edits and archives services; customers only see active ones', async () => {
    const owner = await ownerWithShop()
    expect((await request('GET', '/api/dashboard/services', { cookie: owner.cookie })).json.data).toEqual([])

    const created = await request('POST', '/api/dashboard/services', {
      body: { name: 'Haircut', durationMinutes: 20, priceMinor: 15000 },
      cookie: owner.cookie
    })
    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({ name: 'Haircut', durationMinutes: 20, priceMinor: 15000, isActive: true })
    const id = created.json.data.id as string

    const edited = await request('PATCH', `/api/dashboard/services/${id}`, { body: { priceMinor: 18000 }, cookie: owner.cookie })
    expect(edited.json.data).toMatchObject({ priceMinor: 18000, name: 'Haircut' })
    expect((await request('GET', `/api/shops/${owner.shopId}/services`)).json.data).toHaveLength(1)

    const archived = await request('PATCH', `/api/dashboard/services/${id}`, { body: { isActive: false }, cookie: owner.cookie })
    expect(archived.json.data.isActive).toBe(false)
    expect((await request('GET', `/api/shops/${owner.shopId}/services`)).json.data).toEqual([])
    expect((await request('GET', '/api/dashboard/services', { cookie: owner.cookie })).json.data).toHaveLength(1)
  })

  it('validates service details', async () => {
    const owner = await ownerWithShop()
    for (const body of [
      { name: '', durationMinutes: 20, priceMinor: 100 },
      { name: 'Too quick', durationMinutes: 0, priceMinor: 100 },
      { name: 'Negative', durationMinutes: 20, priceMinor: -1 },
      { name: 'Extra', durationMinutes: 20, priceMinor: 100, shopId: owner.shopId }
    ]) {
      expectError(await request('POST', '/api/dashboard/services', { body, cookie: owner.cookie }), 400, 'VALIDATION_ERROR')
    }
  })

  it('only lets an owner change their own shop’s services', async () => {
    const owner = await ownerWithShop()
    const other = await ownerWithShop()
    const service = await request('POST', '/api/dashboard/services', {
      body: { name: 'Beard', durationMinutes: 10, priceMinor: 10000 },
      cookie: owner.cookie
    })

    expectError(
      await request('PATCH', `/api/dashboard/services/${service.json.data.id}`, { body: { priceMinor: 1 }, cookie: other.cookie }),
      404,
      'SERVICE_NOT_FOUND'
    )
    const noShop = await signUp(uniqueEmail('noshop'))
    expectError(await request('GET', '/api/dashboard/services', { cookie: noShop.cookie }), 403, 'FORBIDDEN')
    expectError(await request('GET', '/api/dashboard/services'), 401, 'UNAUTHENTICATED')
  })
})
