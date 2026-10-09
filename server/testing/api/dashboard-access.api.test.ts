// The dashboard is reached only with a real Better Auth session: page
// redirects (server render), what the header shows, logout, and the APIs.
import { randomInt, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMemberFixture, createShopFixture, resetDatabase } from '../fixtures'
import { baseUrl, expectError, newClientIp, request, signUp } from './http'
import { waitForCode } from './sms'

/** A page as the browser gets it on load or refresh (server-rendered), redirects not followed. */
async function page(path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    headers: { 'x-forwarded-for': newClientIp(), ...(cookie ? { cookie } : {}) }
  })
  return { status: response.status, location: response.headers.get('location'), html: response.status === 200 ? await response.text() : '' }
}

function expectLoginRedirect(response: { status: number, location: string | null }, from: string) {
  expect(response.status).toBe(302)
  const location = new URL(response.location ?? '', baseUrl)
  expect(location.pathname).toBe('/auth/login')
  expect(location.searchParams.get('redirect')).toBe(from)
}

let owner: { userId: string, cookie: string }
const ownerEmail = `access-owner-${randomUUID().slice(0, 8)}@trimly.test`

beforeAll(async () => {
  await resetDatabase()
  owner = await signUp(ownerEmail, 'Faisal Rahman')
  await createShopFixture({ ownerUserId: owner.userId, slug: `access-${randomUUID().slice(0, 6)}` })
})

describe('dashboard access', () => {
  it('sends a logged-out visitor to the login page, remembering where they were going', async () => {
    for (const path of ['/dashboard', '/dashboard/appointments', '/dashboard/settings', '/dashboard/reports']) {
      expectLoginRedirect(await page(path), path)
    }
  })

  it('loads the dashboard for a logged-in owner, showing who is signed in and a way out', async () => {
    const response = await page('/dashboard', owner.cookie)

    expect(response.status).toBe(200)
    expect(response.html).toContain('Faisal Rahman')
    expect(response.html).toContain(ownerEmail)
    expect(response.html).toContain('Open menu to sign out')
  })

  it('shows the real shop of the signed-in user: name, owner and details', async () => {
    const { cookie } = await signUp(`access-real-${randomUUID().slice(0, 8)}@trimly.test`, 'Nabil Ahmed')
    const shopName = `Nabil's Salon ${randomUUID().slice(0, 4)}`
    const created = await request('POST', '/api/onboarding/shop', {
      cookie,
      body: { name: shopName, phone: '98765 43210', address: 'Broadway, Kochi', currency: 'INR' }
    })
    expect(created.status).toBe(201)

    const response = await page('/dashboard', cookie)
    expect(response.status).toBe(200)
    for (const text of [
      shopName.replace('\'', '&#39;'),
      'Good',
      'Nabil Ahmed',
      '+91 98765 43210',
      'Broadway, Kochi',
      `/shop/${created.json.data.slug}`,
      'Your role: Owner'
    ]) {
      expect(response.html, text).toContain(text)
    }
    // Nothing from another shop leaks in.
    expect(response.html).not.toContain('Faisal')
    // Customers get the shop page through the QR code, not a button on the queue screen.
    expect(response.html).toContain('QR code')
    expect(response.html).not.toContain('Customer page<')
  })

  it('puts the sections in a bottom tab bar; Settings (with Staff) is in the account menu', async () => {
    const bottomTabs = (html: string) => {
      const bar = /<nav class="fixed inset-x-0 bottom-0[^"]*"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? ''
      return [...bar.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    }

    const ownerPage = (await page('/dashboard', owner.cookie)).html
    expect(bottomTabs(ownerPage)).toEqual(['/dashboard', '/dashboard/appointments', '/dashboard/services', '/dashboard/reports'])
    // Settings is in the account menu, not the bar.
    expect(ownerPage).toContain('Open menu to sign out')
    // The current page is marked for screen readers.
    expect(ownerPage).toMatch(/<a[^>]*href="\/dashboard"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/dashboard"/)

    const shop = await createShopFixture({ slug: `tabs-${randomUUID().slice(0, 6)}` })
    const barber = await signUp(`access-tabs-${randomUUID().slice(0, 8)}@trimly.test`)
    await addMemberFixture(shop.shopId, barber.userId, 'BARBER')
    expect(bottomTabs((await page('/dashboard', barber.cookie)).html)).toEqual(['/dashboard', '/dashboard/appointments'])

    // Staff opens from Settings.
    expect((await page('/dashboard/settings', owner.cookie)).html).toContain('href="/dashboard/settings/staff"')
    const staff = await page('/dashboard/settings/staff', owner.cookie)
    expect(staff.status).toBe(200)
    expect(staff.html).toContain('href="/dashboard/settings"')
    // Barbers can't open it; the old address still works.
    expect(await page('/dashboard/settings/staff', barber.cookie)).toMatchObject({ status: 302, location: '/dashboard' })
    expect(await page('/dashboard/staff', owner.cookie)).toMatchObject({ status: 307, location: '/dashboard/settings/staff' })
  })

  it('keeps the session across page refreshes', async () => {
    for (let refresh = 0; refresh < 3; refresh++) {
      expect((await page('/dashboard', owner.cookie)).status).toBe(200)
    }
    expect((await page('/dashboard/settings', owner.cookie)).status).toBe(200)
  })

  it('locks the dashboard again after logout (pages and APIs)', async () => {
    const { userId, cookie } = await signUp(`access-logout-${randomUUID().slice(0, 8)}@trimly.test`)
    await createShopFixture({ ownerUserId: userId, slug: `logout-${randomUUID().slice(0, 6)}` })
    expect((await page('/dashboard', cookie)).status).toBe(200)

    expect((await request('POST', '/api/auth/sign-out', { cookie, body: {} })).status).toBe(200)

    expectLoginRedirect(await page('/dashboard', cookie), '/dashboard')
    expectError(await request('GET', '/api/dashboard', { cookie }), 401, 'UNAUTHENTICATED')
  })

  it('answers 401 to API requests without a session', async () => {
    for (const path of ['/api/me', '/api/dashboard', '/api/dashboard/appointments?from=2026-10-01&to=2026-10-02', '/api/shop/services', '/api/reports?period=day', '/api/dashboard/hours', '/api/dashboard/notifications']) {
      expectError(await request('GET', path), 401, 'UNAUTHENTICATED')
    }
    expectError(await request('PATCH', '/api/dashboard/shop', { body: { isOpen: false } }), 401, 'UNAUTHENTICATED')
    // A made-up session cookie is no session.
    expectError(await request('GET', '/api/dashboard', { cookie: 'better-auth.session_token=forged.value' }), 401, 'UNAUTHENTICATED')
  })

  it('shows the mobile number for an account created by phone', async () => {
    const phoneNumber = `+919${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`
    await request('POST', '/api/auth/phone-number/send-otp', { body: { phoneNumber } })
    const verified = await request('POST', '/api/auth/phone-number/verify', { body: { phoneNumber, code: await waitForCode(phoneNumber) } })
    const cookie = verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    await request('POST', '/api/auth/update-user', { cookie, body: { name: 'Nabil' } })
    await createShopFixture({ ownerUserId: verified.json.user.id, slug: `phone-${randomUUID().slice(0, 6)}` })

    const response = await page('/dashboard', cookie)
    expect(response.status).toBe(200)
    expect(response.html).toContain('Nabil')
    expect(response.html).toContain(`${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3, 8)} ${phoneNumber.slice(8)}`)
  })
})

describe('where signed-in people are sent', () => {
  it('sends an account without a shop to onboarding, and an owner away from it', async () => {
    const { cookie } = await signUp(`access-new-${randomUUID().slice(0, 8)}@trimly.test`)
    expect(await page('/dashboard', cookie)).toMatchObject({ status: 302, location: '/onboarding/shop' })
    expect((await page('/onboarding/shop', cookie)).status).toBe(200)
    expect(await page('/onboarding/shop', owner.cookie)).toMatchObject({ status: 302, location: '/dashboard' })
  })

  it('shows the shop setup form to an account without a shop', async () => {
    const { cookie } = await signUp(`access-setup-${randomUUID().slice(0, 8)}@trimly.test`)
    const response = await page('/onboarding/shop', cookie)

    expect(response.status).toBe(200)
    for (const text of ['Welcome to Trimly', 'Let&#39;s set up your barber shop.', 'Shop name', 'Phone', 'Address', 'Currency', 'Create Shop']) {
      expect(response.html, text).toContain(text)
    }
    // Every field has a label tied to its input.
    for (const label of ['Shop name', 'Phone', 'Address']) {
      const id = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>\\s*(?:<[^>]+>\\s*)*${label}`).exec(response.html)?.[1]
      expect(id && response.html.includes(`id="${id}"`), label).toBe(true)
    }
    expectLoginRedirect(await page('/onboarding/shop'), '/onboarding/shop')
    expect(await page('/onboarding', cookie)).toMatchObject({ status: 307, location: '/onboarding/shop' })
  })

  it('sends signed-in people away from the login and sign-up pages', async () => {
    expect(await page('/auth/login', owner.cookie)).toMatchObject({ status: 302, location: '/dashboard' })
    expect(await page('/auth/signup', owner.cookie)).toMatchObject({ status: 302, location: '/dashboard' })
    expect((await page('/auth/login')).status).toBe(200)
  })

  it('keeps barbers out of owner-only pages', async () => {
    const shop = await createShopFixture({ slug: `barber-shop-${randomUUID().slice(0, 6)}` })
    const barber = await signUp(`access-barber-${randomUUID().slice(0, 8)}@trimly.test`, 'Arjun')
    await addMemberFixture(shop.shopId, barber.userId, 'BARBER')

    expect((await page('/dashboard', barber.cookie)).status).toBe(200)
    expect(await page('/dashboard/reports', barber.cookie)).toMatchObject({ status: 302, location: '/dashboard' })
    expect(await page('/dashboard/services', barber.cookie)).toMatchObject({ status: 302, location: '/dashboard' })
    // And the server refuses regardless of the page.
    expectError(await request('GET', '/api/reports?period=day', { cookie: barber.cookie }), 403, 'INSUFFICIENT_ROLE')
  })
})
