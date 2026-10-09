import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../db'
import { barbers, queueEntries, shopMembers, user } from '../db/schema'
import { createShopFixture, resetDatabase } from '../testing/fixtures'
import { DomainError } from './errors'
import { listMemberships } from './membership.service'
import { addCustomer } from './queue/queue.service'
import { createShopWithOwner } from './shop.service'
import { addBarber, claimStaffInvites, listStaff, updateStaff } from './staff.service'

async function createUser(id: string, phoneNumber: string | null = null, phoneNumberVerified = phoneNumber !== null) {
  await useDb().insert(user).values({ id, name: id, email: `${id}@trimly.test`, emailVerified: true, phoneNumber, phoneNumberVerified })
  return id
}

async function newShop(ownerId: string) {
  return createShopWithOwner({ ownerUserId: await createUser(ownerId), barberName: ownerId, name: `${ownerId} cuts`, phone: '+919800000000', address: null, timezone: 'Asia/Kolkata', currency: 'INR' })
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(() => {
    throw new Error('Expected a rejection')
  }, (error: unknown) => error as DomainError)
}

beforeEach(async () => {
  await resetDatabase()
})

describe('adding a barber', () => {
  it('gives a new shop the owner\'s own chair, linked to them', async () => {
    const shop = await newShop('owner')
    expect(await listStaff(shop.id)).toEqual([
      expect.objectContaining({ name: 'owner', role: 'OWNER', account: expect.objectContaining({ status: 'LINKED', name: 'owner' }), status: 'AVAILABLE' })
    ])
  })

  it('invites someone without an account, and links them when they verify that number', async () => {
    const shop = await newShop('owner')
    const barberId = await addBarber(shop.id, { name: 'Arjun', phone: '+919811111111' })

    expect((await listStaff(shop.id)).find(member => member.id === barberId)).toMatchObject({ role: null, account: { status: 'INVITED' }, invitePhone: '+919811111111', isActive: true })

    const arjun = await createUser('arjun', '+919811111111')
    await claimStaffInvites('+919811111111', arjun)

    expect(await listMemberships(arjun)).toEqual([expect.objectContaining({ shopId: shop.id, role: 'BARBER' })])
    expect((await listStaff(shop.id)).find(member => member.id === barberId)).toMatchObject({ role: 'BARBER', account: { status: 'LINKED', name: 'arjun', phoneNumber: '+919811111111' } })
  })

  it('links an existing verified account straight away', async () => {
    const shop = await newShop('owner')
    const nabil = await createUser('nabil', '+919822222222')

    const barberId = await addBarber(shop.id, { name: 'Nabil', phone: '+919822222222' })

    expect(await listMemberships(nabil)).toEqual([expect.objectContaining({ shopId: shop.id, role: 'BARBER' })])
    expect((await listStaff(shop.id)).find(member => member.id === barberId)?.account.status).toBe('LINKED')
  })

  it('does not link an unverified number', async () => {
    const shop = await newShop('owner')
    const unverified = await createUser('unverified', '+919833333333', false)

    await addBarber(shop.id, { name: 'U', phone: '+919833333333' })
    await claimStaffInvites('+919800000099', unverified)

    expect(await listMemberships(unverified)).toEqual([])
  })

  it('refuses the same number twice, and someone who works at another shop', async () => {
    const shop = await newShop('owner')
    await addBarber(shop.id, { name: 'Arjun', phone: '+919811111111' })
    expect((await rejection(addBarber(shop.id, { name: 'Arjun again', phone: '+919811111111' }))).code).toBe('ALREADY_STAFF')

    const elsewhere = await newShop('other-owner')
    const busy = await createUser('busy', '+919844444444')
    await addBarber(elsewhere.id, { name: 'Busy', phone: '+919844444444' })
    expect(await listMemberships(busy)).toHaveLength(1)
    expect((await rejection(addBarber(shop.id, { name: 'Busy', phone: '+919844444444' }))).code).toBe('MEMBER_OF_ANOTHER_SHOP')
  })

  it('links only the oldest invitation when several shops invite the same number', async () => {
    const first = await newShop('first')
    const second = await newShop('second')
    await addBarber(first.id, { name: 'Sam', phone: '+919855555555' })
    await addBarber(second.id, { name: 'Sam', phone: '+919855555555' })

    const sam = await createUser('sam', '+919855555555')
    await claimStaffInvites('+919855555555', sam)

    expect(await listMemberships(sam)).toEqual([expect.objectContaining({ shopId: first.id })])
    expect((await listStaff(second.id)).find(member => member.name === 'Sam')?.account.status).toBe('INVITED')
  })
})

describe('deactivating and reactivating', () => {
  it('refuses while customers are waiting, and for the last active barber', async () => {
    const shop = await createShopFixture({ slug: 'busy' })
    await addCustomer({ shopId: shop.shopId, customer: { name: 'A', phone: '+919990000001' }, serviceId: shop.services.haircut, barberId: shop.barberId, source: 'WALK_IN' })

    expect((await rejection(updateStaff(shop.shopId, shop.barberId, { isActive: false }))).code).toBe('BARBER_HAS_CUSTOMERS')

    await useDb().update(queueEntries).set({ status: 'CANCELLED' }).where(eq(queueEntries.shopId, shop.shopId))
    expect((await rejection(updateStaff(shop.shopId, shop.barberId, { isActive: false }))).code).toBe('LAST_ACTIVE_BARBER')
  })

  it('removes a barber\'s access, and gives it back on reactivation', async () => {
    const shop = await newShop('owner')
    const arjun = await createUser('arjun', '+919811111111')
    const barberId = await addBarber(shop.id, { name: 'Arjun', phone: '+919811111111' })

    await updateStaff(shop.id, barberId, { isActive: false })
    expect(await listMemberships(arjun)).toEqual([])
    expect((await listStaff(shop.id)).find(member => member.id === barberId)).toMatchObject({ isActive: false, status: 'INACTIVE', account: { status: 'INVITED' } })

    await updateStaff(shop.id, barberId, { isActive: true, name: 'Arjun N' })
    expect(await listMemberships(arjun)).toEqual([expect.objectContaining({ role: 'BARBER' })])
    expect((await listStaff(shop.id)).find(member => member.id === barberId)).toMatchObject({ name: 'Arjun N', isActive: true, account: { status: 'LINKED' } })
  })

  it('keeps the owner\'s access when their own chair is deactivated', async () => {
    const shop = await newShop('owner')
    await addBarber(shop.id, { name: 'Arjun', phone: '+919811111111' })
    const ownerChair = (await listStaff(shop.id)).find(member => member.role === 'OWNER')!

    await updateStaff(shop.id, ownerChair.id, { isActive: false })

    expect(await listMemberships('owner')).toEqual([expect.objectContaining({ role: 'OWNER' })])
    const [chair] = await useDb().select().from(barbers).where(eq(barbers.id, ownerChair.id))
    expect(chair).toMatchObject({ isActive: false, memberId: expect.any(String) })
  })

  it('only touches the given shop\'s barbers', async () => {
    const shop = await newShop('owner')
    const other = await createShopFixture({ slug: 'other' })

    expect((await rejection(updateStaff(shop.id, other.barberId, { name: 'Hijacked' }))).code).toBe('BARBER_NOT_FOUND')
    const [untouched] = await useDb().select().from(barbers).where(and(eq(barbers.id, other.barberId)))
    expect(untouched?.name).toBe('Faisal')
    expect(await useDb().select().from(shopMembers).where(eq(shopMembers.shopId, other.shopId))).toHaveLength(1)
  })
})
