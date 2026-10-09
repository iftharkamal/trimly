// The MVP core, end to end, in order, the way people use it (no fixtures,
// nothing seeded): a new owner signs up and verifies by email, logs in,
// creates a shop, adds a service and a barber; the barber signs up by phone;
// a customer finds the shop and joins; the barber starts and completes; the
// queue moves and the customer's ETA updates.
import { randomInt, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { resetDatabase } from '../fixtures'
import { linkIn, waitForEmail } from './emails'
import { baseUrl, cookieFrom, newClientIp, request, signIn, TEST_PASSWORD, type ApiResponse } from './http'
import { countCodes, waitForCode } from './sms'

const mobile = () => `+919${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`
const cookieOf = (response: ApiResponse) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

/** A page as a browser loads it (server-rendered), redirects not followed. */
async function page(path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: { 'x-forwarded-for': newClientIp(), ...(cookie ? { cookie } : {}) } })
  return { status: response.status, location: response.headers.get('location'), html: response.status === 200 ? await response.text() : '' }
}

beforeAll(async () => {
  await resetDatabase()
})

describe('MVP core flow', () => {
  // Carried from step to step, like a real session.
  const ownerEmail = `mvp-owner-${randomUUID().slice(0, 8)}@trimly.test`
  const barberMobile = mobile()
  let ownerCookie = ''
  let barberCookie = ''
  let shop: { id: string, slug: string }
  let serviceId = ''
  let barberId = ''
  const customers: { name: string, trackingCode: string, entryId: string }[] = []

  const track = async (code: string) => (await request('GET', `/api/track/${code}`)).json.data

  it('1. a new user signs up with email: no session until verified', async () => {
    const response = await request('POST', '/api/auth/sign-up/email', {
      body: { name: 'Faisal Rahman', email: ownerEmail, password: TEST_PASSWORD, callbackURL: '/auth/verify' }
    })
    expect(response.status).toBe(200)
    expect(cookieOf(response)).not.toContain('session_token')
    expect((await signIn(ownerEmail)).status).toBe(403)
  })

  it('2. verifies the email from the link (which signs them in)', async () => {
    const link = linkIn(await waitForEmail(ownerEmail, 'Verify your email'))
    const verified = await fetch(link, { redirect: 'manual', headers: { 'x-forwarded-for': newClientIp() } })
    expect(verified.headers.get('location')).toBe('/auth/verify')
    expect(cookieFrom(verified)).toContain('session_token')
  })

  it('3. logs in with the password and, without a shop, is sent to onboarding', async () => {
    const login = await signIn(ownerEmail)
    expect(login.status).toBe(200)
    ownerCookie = cookieFrom(login)

    expect(await page('/dashboard', ownerCookie)).toMatchObject({ status: 302, location: '/onboarding/shop' })
    expect((await page('/onboarding/shop', ownerCookie)).status).toBe(200)
  })

  it('4. creates a shop and becomes its owner', async () => {
    const created = await request('POST', '/api/onboarding/shop', {
      cookie: ownerCookie,
      body: { name: 'Faisal Barber Studio', phone: '98765 43210', address: 'MG Road, Kochi', currency: 'INR' }
    })
    expect(created.status).toBe(201)
    shop = created.json.data
    expect((await request('GET', '/api/me', { cookie: ownerCookie })).json.data).toMatchObject({ role: 'OWNER', shop: { id: shop.id } })
    expect(await page('/onboarding/shop', ownerCookie)).toMatchObject({ status: 302, location: '/dashboard' })
  })

  it('5. adds a service', async () => {
    const created = await request('POST', '/api/shop/services', { cookie: ownerCookie, body: { name: 'Haircut', durationMinutes: 20, priceMinor: 15000 } })
    expect(created.status).toBe(201)
    serviceId = created.json.data.id
    // The queue estimates with no gap, so the arithmetic below is just durations.
    await request('PATCH', '/api/dashboard/shop', { cookie: ownerCookie, body: { serviceBufferMinutes: 0 } })
  })

  it('6. adds a barber by name and mobile', async () => {
    const added = await request('POST', '/api/shop/staff', { cookie: ownerCookie, body: { name: 'Arjun', phone: barberMobile } })
    expect(added.status).toBe(201)
    expect(added.json.data.account.status).toBe('INVITED')
    barberId = added.json.data.id
    // The owner doesn't take customers today: their chair is switched off.
    const ownerChair = ((await request('GET', '/api/shop/staff', { cookie: ownerCookie })).json.data as { id: string, role: string | null }[]).find(member => member.role === 'OWNER')!
    expect((await request('PATCH', `/api/shop/staff/${ownerChair.id}`, { cookie: ownerCookie, body: { isActive: false } })).status).toBe(200)
  })

  it('7. the barber signs up with that mobile (phone verified by OTP) and opens their dashboard', async () => {
    const before = countCodes(barberMobile)
    expect((await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber: barberMobile } })).status).toBe(200)
    const verified = await request('POST', '/api/auth/phone-number/verify', { body: { phoneNumber: barberMobile, code: await waitForCode(barberMobile, before) } })
    expect(verified.status).toBe(200)
    barberCookie = cookieOf(verified)
    await request('POST', '/api/auth/update-user', { cookie: barberCookie, body: { name: 'Arjun N' } })

    const dashboard = await request('GET', '/api/dashboard', { cookie: barberCookie })
    expect(dashboard.json.data).toMatchObject({ shop: { id: shop.id }, member: { role: 'BARBER', barberId } })
    expect((await page('/dashboard', barberCookie)).status).toBe(200)
  })

  it('8. customers find the shop and join the queue', async () => {
    const found = await request('GET', `/api/shops/by-slug/${shop.slug}`)
    expect(found.json.data).toMatchObject({ id: shop.id, isOpen: true })
    expect((await page(`/shop/${shop.slug}`)).status).toBe(200)
    const menu = (await request('GET', `/api/shops/${shop.id}/services`)).json.data
    expect(menu).toEqual([{ id: serviceId, name: 'Haircut', durationMinutes: 20, priceMinor: 15000 }])

    for (const name of ['Asha', 'Bilal', 'Chitra']) {
      const joined = await request('POST', `/api/shops/${shop.id}/queue`, { body: { name, phone: mobile(), serviceId } })
      expect(joined.status).toBe(201)
      customers.push({ name, trackingCode: joined.json.data.trackingCode, entryId: joined.json.data.entry.id })
    }
    // Positions and ETAs, calculated by the server.
    expect(await track(customers[0]!.trackingCode)).toMatchObject({ position: 1, waitMinutes: 0, barberName: 'Arjun' })
    expect(await track(customers[1]!.trackingCode)).toMatchObject({ position: 2, waitMinutes: 20 })
    expect(await track(customers[2]!.trackingCode)).toMatchObject({ position: 3, waitMinutes: 40 })
    expect((await page(`/queue/${customers[2]!.trackingCode}`)).status).toBe(200)
  })

  it('9. the barber sees them and starts the first', async () => {
    const queue = (await request('GET', `/api/shops/${shop.id}/queue`, { cookie: barberCookie })).json.data
    expect(queue.view).toBe('owner')
    expect(queue.barbers.find((lane: { barber: { id: string } }) => lane.barber.id === barberId).waiting.map((item: { entry: { customer: { name: string } } }) => item.entry.customer.name))
      .toEqual(['Asha', 'Bilal', 'Chitra'])

    expect((await request('POST', `/api/queue/${customers[0]!.entryId}/start`, { cookie: barberCookie })).status).toBe(200)
    expect(await track(customers[0]!.trackingCode)).toMatchObject({ status: 'IN_PROGRESS' })
    expect(await track(customers[1]!.trackingCode)).toMatchObject({ position: 1, state: 'YOU_ARE_NEXT' })
  })

  it('10. completes (with payment); the queue moves and ETAs update', async () => {
    const completed = await request('POST', `/api/queue/${customers[0]!.entryId}/complete`, {
      cookie: barberCookie,
      body: { payment: { method: 'UPI', amountMinor: 15000 } }
    })
    expect(completed.status).toBe(200)

    expect(await track(customers[0]!.trackingCode)).toMatchObject({ status: 'COMPLETED' })
    expect(await track(customers[1]!.trackingCode)).toMatchObject({ position: 1, waitMinutes: 0 })
    expect(await track(customers[2]!.trackingCode)).toMatchObject({ position: 2, waitMinutes: 20 })
    // And it shows up in the owner's numbers.
    expect((await request('GET', '/api/dashboard', { cookie: ownerCookie })).json.data.today).toMatchObject({ servicesCompleted: 1, revenueMinor: 15000 })
  })
})
