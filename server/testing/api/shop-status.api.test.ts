// Opening and closing the shop (any member), the owner-only settings, and the
// calm queue screen: status chip, one-line summary (takings for the owner
// only) and the floating walk-in button.
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMemberFixture, createShopFixture, resetDatabase, type ShopFixture } from '../fixtures'
import { baseUrl, expectError, newClientIp, request, signUp } from './http'

const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@trimly.test`

async function page(path: string, cookie: string) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: { cookie, 'x-forwarded-for': newClientIp() } })
  return response.text()
}

let shop: ShopFixture & { slug: string }
let owner: { userId: string, cookie: string }
let barber: { userId: string, cookie: string }
let receptionist: { userId: string, cookie: string }

beforeAll(async () => {
  await resetDatabase()
  owner = await signUp(uniqueEmail('status-owner'))
  const slug = `status-${randomUUID().slice(0, 6)}`
  shop = { ...(await createShopFixture({ ownerUserId: owner.userId, slug })), slug }
  barber = await signUp(uniqueEmail('status-barber'))
  receptionist = await signUp(uniqueEmail('status-desk'))
  await addMemberFixture(shop.shopId, barber.userId, 'BARBER')
  await addMemberFixture(shop.shopId, receptionist.userId, 'RECEPTIONIST')
})

const setOpen = (cookie: string, isOpen: boolean) => request('PATCH', '/api/dashboard/shop', { cookie, body: { isOpen } })
/** The shop as customers see it. */
const publicShop = async () => (await request('GET', `/api/shops/by-slug/${shop.slug}`)).json.data

describe('opening and closing the shop', () => {
  it('can be done by any member: owner, barber or receptionist', async () => {
    const closed = await setOpen(barber.cookie, false)
    expect(closed.status).toBe(200)
    expect(closed.json.data.isOpen).toBe(false)
    expect((await publicShop()).isOpen).toBe(false)
    // Closed: online customers can't join; the shop's staff can still add walk-ins.
    expectError(await request('POST', `/api/shops/${shop.shopId}/queue`, { body: { name: 'Online', phone: '+919990001111', serviceId: shop.services.haircut } }), 409, 'SHOP_CLOSED')
    expect((await request('POST', `/api/shops/${shop.shopId}/queue`, { cookie: barber.cookie, body: { name: 'Walk-in', serviceId: shop.services.haircut } })).status).toBe(201)

    expect((await setOpen(receptionist.cookie, true)).json.data.isOpen).toBe(true)
    expect((await setOpen(owner.cookie, false)).json.data.isOpen).toBe(false)
    expect((await setOpen(owner.cookie, true)).json.data.isOpen).toBe(true)
  })

  it('keeps the time between customers for the owner only', async () => {
    for (const cookie of [barber.cookie, receptionist.cookie]) {
      expectError(await request('PATCH', '/api/dashboard/shop', { cookie, body: { serviceBufferMinutes: 0 } }), 403, 'INSUFFICIENT_ROLE')
      // Asking for both changes neither.
      expectError(await request('PATCH', '/api/dashboard/shop', { cookie, body: { isOpen: false, serviceBufferMinutes: 0 } }), 403, 'INSUFFICIENT_ROLE')
    }
    expect(await publicShop()).toMatchObject({ isOpen: true, serviceBufferMinutes: 5 })
    expect((await request('PATCH', '/api/dashboard/shop', { cookie: owner.cookie, body: { serviceBufferMinutes: 10 } })).json.data.serviceBufferMinutes).toBe(10)
  })

  it('is refused to people outside the shop', async () => {
    const outsider = await signUp(uniqueEmail('status-outsider'))
    expectError(await setOpen(outsider.cookie, false), 403, 'FORBIDDEN')
    expectError(await request('PATCH', '/api/dashboard/shop', { body: { isOpen: false } }), 401, 'UNAUTHENTICATED')
    expect((await publicShop()).isOpen).toBe(true)
  })
})

describe('the queue screen', () => {
  it('shows takings to the owner only (the server sends none to staff)', async () => {
    expect((await request('GET', '/api/dashboard', { cookie: owner.cookie })).json.data.today.revenueMinor).toEqual(expect.any(Number))
    for (const cookie of [barber.cookie, receptionist.cookie]) {
      expect((await request('GET', '/api/dashboard', { cookie })).json.data.today.revenueMinor).toBeNull()
    }
  })

  it('is calm: a status chip, one summary line and a floating walk-in button', async () => {
    const ownerHtml = await page('/dashboard', owner.cookie)
    expect(ownerHtml).toContain('aria-label="Shop is open to online customers. Change"')
    expect(ownerHtml).toContain('aria-label="Add a walk-in customer"')
    expect(ownerHtml).toMatch(/Today: \d+ customers? · \d+ done · ₹/)
    for (const gone of ['Online joining', 'Add Customer', 'Revenue today']) {
      expect(ownerHtml, gone).not.toContain(gone)
    }

    const barberHtml = await page('/dashboard', barber.cookie)
    expect(barberHtml).toMatch(/Today: \d+ customers? · \d+ done\s*</)
    expect(barberHtml).toContain('aria-label="Shop is open to online customers. Change"')
  })

  it('gives the owner the staff permission in Settings (opening and closing stays on the queue screen)', async () => {
    const settings = await page('/dashboard/settings', owner.cookie)
    expect(settings).toContain('Staff permissions')
    expect(settings).toContain('Staff can open and close the shop')
    expect(settings).not.toContain('aria-label="Taking online customers"')
  })
})

describe('the owner\'s "staff can open and close" permission', () => {
  const allow = (cookie: string, staffCanOpenClose: boolean) => request('PATCH', '/api/dashboard/shop', { cookie, body: { staffCanOpenClose } })

  it('is on by default and changed by the owner only', async () => {
    expect((await publicShop()).staffCanOpenClose).toBe(true)
    for (const cookie of [barber.cookie, receptionist.cookie]) {
      expectError(await allow(cookie, false), 403, 'INSUFFICIENT_ROLE')
    }
    expect((await publicShop()).staffCanOpenClose).toBe(true)
  })

  it('when off, only the owner can open and close; staff see the status without a control', async () => {
    expect((await allow(owner.cookie, false)).json.data.staffCanOpenClose).toBe(false)

    for (const cookie of [barber.cookie, receptionist.cookie]) {
      expectError(await setOpen(cookie, false), 403, 'INSUFFICIENT_ROLE')
    }
    expect((await publicShop()).isOpen).toBe(true)
    const barberHtml = await page('/dashboard', barber.cookie)
    expect(barberHtml).toContain('aria-label="Shop is open to online customers"')
    expect(barberHtml).not.toContain('to online customers. Change')
    expect(await page('/dashboard', owner.cookie)).toContain('aria-label="Shop is open to online customers. Change"')

    expect((await setOpen(owner.cookie, false)).json.data.isOpen).toBe(false)
    expect((await setOpen(owner.cookie, true)).json.data.isOpen).toBe(true)
  })

  it('when back on, staff can open and close again', async () => {
    await allow(owner.cookie, true)
    expect((await setOpen(barber.cookie, false)).json.data.isOpen).toBe(false)
    expect((await setOpen(receptionist.cookie, true)).json.data.isOpen).toBe(true)
  })
})
