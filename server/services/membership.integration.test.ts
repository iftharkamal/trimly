import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../db'
import { isUniqueViolation } from '../db/errors'
import { shopMembers, shops, user } from '../db/schema'
import { addMemberFixture, createShopFixture, resetDatabase } from '../testing/fixtures'
import { resolveCurrentMembership } from '../utils/session'
import { DomainError } from './errors'
import { listMemberships } from './membership.service'
import { createShopWithOwner } from './shop.service'

async function createUser(id: string) {
  await useDb().insert(user).values({ id, name: id, email: `${id}@trimly.test`, emailVerified: true })
  return id
}

function shopInput(ownerUserId: string, name = 'Kochi Cuts') {
  return { ownerUserId, barberName: 'Arjun', name, phone: '+919876543210', address: null, timezone: 'Asia/Kolkata', currency: 'INR' }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => {
    throw new Error('Expected a rejection')
  }, (error: unknown) => error)
}

beforeEach(async () => {
  await resetDatabase()
})

describe('shop_members', () => {
  it('lets a person belong to several shops, with a role in each', async () => {
    const person = await createUser('arjun')
    const first = await createShopFixture({ slug: 'first' })
    const second = await createShopFixture({ slug: 'second' })
    await addMemberFixture(first.shopId, person, 'BARBER')
    await addMemberFixture(second.shopId, person, 'RECEPTIONIST')

    expect(await listMemberships(person)).toEqual([
      expect.objectContaining({ shopId: first.shopId, role: 'BARBER' }),
      expect.objectContaining({ shopId: second.shopId, role: 'RECEPTIONIST' })
    ])
  })

  it('lets a shop have several people', async () => {
    const shop = await createShopFixture({ slug: 'busy' })
    await addMemberFixture(shop.shopId, await createUser('barber-1'), 'BARBER')
    await addMemberFixture(shop.shopId, await createUser('barber-2'), 'BARBER')

    const members = await useDb().select().from(shopMembers).where(eq(shopMembers.shopId, shop.shopId))
    expect(members.map(member => member.role).sort()).toEqual(['BARBER', 'BARBER', 'OWNER'])
  })

  it('refuses the same person twice in one shop', async () => {
    const shop = await createShopFixture({ slug: 'twice' })
    const person = await createUser('twice')
    await addMemberFixture(shop.shopId, person, 'BARBER')

    const error = await rejection(addMemberFixture(shop.shopId, person, 'RECEPTIONIST'))
    expect(isUniqueViolation(error, 'shop_members_shop_user_unique')).toBe(true)
  })

  it('allows one OWNER per shop', async () => {
    const shop = await createShopFixture({ slug: 'owned' })

    const error = await rejection(addMemberFixture(shop.shopId, await createUser('second-owner'), 'OWNER'))
    expect(isUniqueViolation(error, 'shop_members_one_owner_per_shop')).toBe(true)
  })

  it('refuses memberships of a missing user or shop, and goes with a deleted user', async () => {
    const shop = await createShopFixture({ slug: 'keys' })
    expect(await rejection(addMemberFixture(shop.shopId, 'nobody', 'BARBER'))).toBeTruthy()
    expect(await rejection(addMemberFixture('00000000-0000-4000-8000-000000000000', await createUser('lonely'), 'BARBER'))).toBeTruthy()

    const leaver = await createUser('leaver')
    await addMemberFixture(shop.shopId, leaver, 'BARBER')
    await useDb().delete(user).where(eq(user.id, leaver))
    expect(await listMemberships(leaver)).toEqual([])
  })
})

describe('createShopWithOwner', () => {
  it('makes the creator the shop\'s OWNER', async () => {
    const creator = await createUser('creator')

    const shop = await createShopWithOwner(shopInput(creator, 'creator-shop'))

    expect(await listMemberships(creator)).toEqual([expect.objectContaining({ shopId: shop.id, role: 'OWNER' })])
  })

  it('refuses a second shop for someone who already belongs to one (for now)', async () => {
    const barber = await createUser('busy-barber')
    await addMemberFixture((await createShopFixture({ slug: 'employer' })).shopId, barber, 'BARBER')

    const error = await rejection(createShopWithOwner(shopInput(barber, 'own-shop')))
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('ALREADY_HAS_SHOP')
  })

  it('creates only one shop when two requests arrive at once', async () => {
    const creator = await createUser('double-click')

    const results = await Promise.allSettled([
      createShopWithOwner(shopInput(creator, 'click-one')),
      createShopWithOwner(shopInput(creator, 'click-two'))
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect((rejected?.reason as DomainError).code).toBe('ALREADY_HAS_SHOP')
    expect(await useDb().select().from(shops)).toHaveLength(1)
    expect(await listMemberships(creator)).toHaveLength(1)
  })
})

describe('link names for new shops', () => {
  it('come from the shop name, with a suffix when it\'s taken', async () => {
    const first = await createShopWithOwner(shopInput(await createUser('first-owner'), 'Faisal\'s Barber Shop'))
    const second = await createShopWithOwner(shopInput(await createUser('second-owner'), 'Faisal\'s Barber Shop'))

    expect(first.slug).toBe('faisals-barber-shop')
    expect(second.slug).toMatch(/^faisals-barber-shop-[a-z2-9]{4}$/)
  })

  it('are long enough for the shop page even for very short names', async () => {
    const shop = await createShopWithOwner(shopInput(await createUser('short'), 'AB'))
    expect(shop.slug).toBe('ab-shop')
  })

  it('stay unique when several shops with the same name are created at once', async () => {
    const owners = await Promise.all(['a', 'b', 'c', 'd'].map(id => createUser(`rush-${id}`)))
    const created = await Promise.all(owners.map(owner => createShopWithOwner(shopInput(owner, 'Rush Hour'))))
    expect(new Set(created.map(shop => shop.slug)).size).toBe(4)
  })
})

describe('resolveCurrentMembership', () => {
  const membership = (shopId: string) => ({ id: `m-${shopId}`, shopId, role: 'OWNER' as const })

  it('is the only membership, or none', () => {
    expect(resolveCurrentMembership([])).toBeNull()
    expect(resolveCurrentMembership([membership('a')])).toEqual(membership('a'))
  })

  it('refuses to guess between several shops (409)', () => {
    expect(() => resolveCurrentMembership([membership('a'), membership('b')])).toThrow(expect.objectContaining({ code: 'SHOP_SELECTION_REQUIRED', statusCode: 409 }))
  })
})
