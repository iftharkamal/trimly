import { eq } from 'drizzle-orm'
import { useDb } from '../db'
import { shops } from '../db/schema'

/** The shop a user owns (MVP: at most one), or null. */
export async function findShopIdByOwner(userId: string): Promise<string | null> {
  const shop = await useDb().query.shops.findFirst({
    where: eq(shops.ownerUserId, userId),
    columns: { id: true }
  })
  return shop?.id ?? null
}
