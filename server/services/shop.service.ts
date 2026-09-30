import { asc, eq } from 'drizzle-orm'
import type { OpeningHours } from '../../shared/schemas/hours'
import { useDb } from '../db'
import { shopHours, shops } from '../db/schema'
import { DomainError } from './errors'

/** The shop a user owns (MVP: at most one), or null. */
export async function findShopIdByOwner(userId: string): Promise<string | null> {
  const shop = await useDb().query.shops.findFirst({
    where: eq(shops.ownerUserId, userId),
    columns: { id: true }
  })
  return shop?.id ?? null
}

export interface ShopProfile {
  id: string
  name: string
  slug: string
  timezone: string
  currency: string
  isOpen: boolean
}

const PROFILE_COLUMNS = { id: true, name: true, slug: true, timezone: true, currency: true, isOpen: true } as const

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
