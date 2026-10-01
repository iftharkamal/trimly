import { and, asc, eq } from 'drizzle-orm'
import { useDb, type Transaction } from '../db'
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

/** Adds a barber to a shop, inside the caller's transaction. */
export async function createBarber(tx: Transaction, shopId: string, name: string): Promise<BarberSummary> {
  const [barber] = await tx.insert(barbers).values({ shopId, name }).returning({ id: barbers.id, name: barbers.name })
  if (!barber) {
    throw new Error('Failed to create barber')
  }
  return barber
}
