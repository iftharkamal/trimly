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
}

export async function getShopProfile(shopId: string): Promise<ShopProfile> {
  const shop = await useDb().query.shops.findFirst({
    where: eq(shops.id, shopId),
    columns: { id: true, name: true, slug: true, timezone: true, currency: true }
  })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }
  return shop
}
