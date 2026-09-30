import { and, asc, eq } from 'drizzle-orm'
import { useDb } from '../db'
import { barbers } from '../db/schema'

export interface BarberSummary {
  id: string
  name: string
}

/** Barbers who can take customers, in the order they were added. */
export function listActiveBarbers(shopId: string): Promise<BarberSummary[]> {
  return useDb()
    .select({ id: barbers.id, name: barbers.name })
    .from(barbers)
    .where(and(eq(barbers.shopId, shopId), eq(barbers.isActive, true)))
    .orderBy(asc(barbers.createdAt))
}
