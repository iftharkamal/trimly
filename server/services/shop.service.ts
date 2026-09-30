import { eq } from 'drizzle-orm'
import { useDb } from '../db'
import { shops } from '../db/schema'
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
