import { randomInt } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import type { OpeningHours } from '../../shared/schemas/hours'
import { suggestSlug } from '../../shared/utils/shop-input'
import { useDb } from '../db'
import { isUniqueViolation } from '../db/errors'
import { shopHours, shops } from '../db/schema'
import { createBarber } from './barber.service'
import { DomainError } from './errors'
import { addMember, lockAndCheckHasMembership } from './membership.service'

export interface ShopProfile {
  id: string
  name: string
  slug: string
  phone: string | null
  address: string | null
  timezone: string
  currency: string
  isOpen: boolean
}

const PROFILE_COLUMNS = { id: true, name: true, slug: true, phone: true, address: true, timezone: true, currency: true, isOpen: true } as const

export async function getShopProfile(shopId: string): Promise<ShopProfile> {
  const shop = await useDb().query.shops.findFirst({ where: eq(shops.id, shopId), columns: PROFILE_COLUMNS })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }
  return shop
}

/** A shop by its public URL name (/shop/:slug). */
export async function getShopProfileBySlug(slug: string): Promise<ShopProfile> {
  const shop = await useDb().query.shops.findFirst({ where: eq(shops.slug, slug), columns: PROFILE_COLUMNS })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }
  return shop
}

/** Opens or closes the shop to online joins. */
export async function setShopOpen(shopId: string, isOpen: boolean): Promise<ShopProfile> {
  const [shop] = await useDb().update(shops).set({ isOpen }).where(eq(shops.id, shopId)).returning({
    id: shops.id,
    name: shops.name,
    slug: shops.slug,
    phone: shops.phone,
    address: shops.address,
    timezone: shops.timezone,
    currency: shops.currency,
    isOpen: shops.isOpen
  })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }
  return shop
}

/** The shop's weekly hours: all 7 days, Monday first; a day with no ranges is closed. */
export async function getOpeningHours(shopId: string): Promise<OpeningHours> {
  const rows = await useDb()
    .select({ weekday: shopHours.weekday, opensAt: shopHours.opensAt, closesAt: shopHours.closesAt })
    .from(shopHours)
    .where(eq(shopHours.shopId, shopId))
    .orderBy(asc(shopHours.weekday), asc(shopHours.opensAt))

  return {
    days: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({
      weekday,
      ranges: rows
        .filter(row => row.weekday === weekday)
        // Postgres returns "HH:MM:SS".
        .map(row => ({ opens: row.opensAt.slice(0, 5), closes: row.closesAt.slice(0, 5) }))
    }))
  }
}

/** Replaces the shop's weekly hours. */
export async function setOpeningHours(shopId: string, hours: OpeningHours): Promise<OpeningHours> {
  await useDb().transaction(async (tx) => {
    await tx.delete(shopHours).where(eq(shopHours.shopId, shopId))
    const rows = hours.days.flatMap(day =>
      day.ranges.map(range => ({ shopId, weekday: day.weekday, opensAt: range.opens, closesAt: range.closes }))
    )
    if (rows.length > 0) {
      await tx.insert(shopHours).values(rows)
    }
  })
  return getOpeningHours(shopId)
}

/** Gap the shop keeps between services, in minutes. */
export async function getServiceBufferMinutes(shopId: string): Promise<number> {
  const shop = await useDb().query.shops.findFirst({ where: eq(shops.id, shopId), columns: { serviceBufferMinutes: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }
  return shop.serviceBufferMinutes
}

// New shops start with these hours (editable in Settings): Mon–Sat 09:00–13:00
// and 14:00–20:00, Sunday closed.
const DEFAULT_OPENING_HOURS = [1, 2, 3, 4, 5, 6].flatMap(weekday => [
  { weekday, opensAt: '09:00', closesAt: '13:00' },
  { weekday, opensAt: '14:00', closesAt: '20:00' }
])

export interface NewShopInput {
  /** From the session, never from the request body. */
  ownerUserId: string
  /** The first barber, usually the owner. */
  barberName: string
  name: string
  phone: string
  address: string | null
  timezone: string
  currency: string
}

/** Whether a link name is free. */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const shop = await useDb().query.shops.findFirst({ where: eq(shops.slug, slug), columns: { id: true } })
  return !shop
}

const SLUG_SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** The customer link name for a new shop: from its name, 3–40 characters. */
function baseSlug(name: string): string {
  const slug = suggestSlug(name)
  return slug.length >= 3 ? slug : `${slug || 'barber'}-shop`
}

/** "kochi-cuts" → "kochi-cuts-k3x9": for when the plain name is taken. */
function withRandomSuffix(base: string): string {
  const suffix = Array.from({ length: 4 }, () => SLUG_SUFFIX_ALPHABET[randomInt(SLUG_SUFFIX_ALPHABET.length)]).join('')
  return `${base.slice(0, 35).replace(/-+$/, '')}-${suffix}`
}

/**
 * Creates a shop with the user as its OWNER member, its first barber and
 * default opening hours, in one transaction, and returns it. For now someone
 * who already belongs to a shop can't create another (409 ALREADY_HAS_SHOP;
 * there's no way to switch between shops yet). That check is locked per user,
 * so repeated or simultaneous requests create one shop. The link name comes
 * from the shop name, with a random suffix if it's taken.
 */
export async function createShopWithOwner(input: NewShopInput): Promise<ShopProfile> {
  const base = baseSlug(input.name)
  let slug = (await isSlugAvailable(base)) ? base : withRandomSuffix(base)

  for (let attempt = 1; ; attempt++) {
    try {
      const shopId = await useDb().transaction(async (tx) => {
        if (await lockAndCheckHasMembership(tx, input.ownerUserId)) {
          throw new DomainError('ALREADY_HAS_SHOP', 409, 'This account already belongs to a shop')
        }
        const [shop] = await tx
          .insert(shops)
          .values({
            name: input.name,
            slug,
            phone: input.phone,
            address: input.address,
            timezone: input.timezone,
            currency: input.currency
          })
          .returning({ id: shops.id })
        if (!shop) {
          throw new Error('Failed to create shop')
        }
        await addMember(tx, { shopId: shop.id, userId: input.ownerUserId, role: 'OWNER' })
        await createBarber(tx, shop.id, input.barberName)
        await tx.insert(shopHours).values(DEFAULT_OPENING_HOURS.map(hours => ({ ...hours, shopId: shop.id })))
        return shop.id
      })
      return await getShopProfile(shopId)
    }
    catch (error) {
      // Another shop took the link name in the meantime: try a new one.
      if (isUniqueViolation(error, 'shops_slug_unique') && attempt < 5) {
        slug = withRandomSuffix(base)
        continue
      }
      throw error
    }
  }
}
