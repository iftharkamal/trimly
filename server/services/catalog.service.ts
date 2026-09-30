// The "services" module (haircut, beard, ...). Named catalog to avoid services/services.ts.
import { and, asc, eq } from 'drizzle-orm'
import { useDb } from '../db'
import { services, shops } from '../db/schema'
import { DomainError } from './errors'

export interface CatalogService {
  id: string
  name: string
  durationMinutes: number
  priceMinor: number
}

/** Services a customer can currently choose, cheapest first. */
export async function listActiveServices(shopId: string): Promise<CatalogService[]> {
  const db = useDb()

  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId), columns: { id: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }

  return db
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      priceMinor: services.priceMinor
    })
    .from(services)
    .where(and(eq(services.shopId, shopId), eq(services.isActive, true)))
    .orderBy(asc(services.priceMinor), asc(services.name))
}
