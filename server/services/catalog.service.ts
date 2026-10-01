// The "services" module (haircut, beard, ...). Named catalog to avoid services/services.ts.
import { and, asc, desc, eq } from 'drizzle-orm'
import { useDb } from '../db'
import { services, shops } from '../db/schema'
import type { CreateServiceBody, UpdateServiceBody } from '../../shared/schemas/service'
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

/** An active service of this shop. */
export async function getActiveService(shopId: string, serviceId: string): Promise<CatalogService> {
  const service = await useDb().query.services.findFirst({
    where: and(eq(services.id, serviceId), eq(services.shopId, shopId), eq(services.isActive, true)),
    columns: { id: true, name: true, durationMinutes: true, priceMinor: true }
  })
  if (!service) {
    throw new DomainError('SERVICE_NOT_FOUND', 404, 'Service not found or not available')
  }
  return service
}

export interface ManagedService extends CatalogService {
  isActive: boolean
}

const MANAGED_COLUMNS = {
  id: services.id,
  name: services.name,
  durationMinutes: services.durationMinutes,
  priceMinor: services.priceMinor,
  isActive: services.isActive
}

/** Every service of the shop, active first, for the owner to manage. */
export function listManagedServices(shopId: string): Promise<ManagedService[]> {
  return useDb()
    .select(MANAGED_COLUMNS)
    .from(services)
    .where(eq(services.shopId, shopId))
    .orderBy(desc(services.isActive), asc(services.priceMinor), asc(services.name))
}

export async function createService(shopId: string, input: CreateServiceBody): Promise<ManagedService> {
  const [service] = await useDb().insert(services).values({ ...input, shopId }).returning(MANAGED_COLUMNS)
  if (!service) {
    throw new Error('Failed to create service')
  }
  return service
}

/**
 * Updates a service of this shop only. Price and duration changes apply to
 * new joins and bookings; existing ones keep what they were given.
 */
export async function updateService(shopId: string, serviceId: string, input: UpdateServiceBody): Promise<ManagedService> {
  const [service] = await useDb()
    .update(services)
    .set(input)
    .where(and(eq(services.id, serviceId), eq(services.shopId, shopId)))
    .returning(MANAGED_COLUMNS)
  if (!service) {
    throw new DomainError('SERVICE_NOT_FOUND', 404, 'Service not found')
  }
  return service
}
