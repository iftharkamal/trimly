import { sql } from 'drizzle-orm'
import { useDb } from '../db'
import { barbers, services, shops, user } from '../db/schema'

/** Empties every table. Only ever called against the `_test` database. */
export async function resetDatabase() {
  await useDb().execute(sql`
    truncate table payments, queue_entries, customers, services, barbers, shops,
      session, account, verification, "user"
    cascade
  `)
}

/** Empties the shop and queue tables but keeps users and sessions. */
export async function resetShopData() {
  await useDb().execute(sql`
    truncate table payments, queue_entries, customers, services, barbers, shops cascade
  `)
}

export interface ShopFixture {
  shopId: string
  barberId: string
  bufferMinutes: number
  services: {
    haircut: string
    beard: string
    haircutAndBeard: string
  }
}

/**
 * A shop shaped like the seed: one barber and the three standard services.
 * Creates a bare owner user unless `ownerUserId` (e.g. a signed-up user) is given.
 */
export async function createShopFixture(
  { bufferMinutes = 5, ownerUserId, slug = 'test-barber' }: { bufferMinutes?: number, ownerUserId?: string, slug?: string } = {}
): Promise<ShopFixture> {
  const db = useDb()

  if (!ownerUserId) {
    const [owner] = await db
      .insert(user)
      // One owner per shop, so a test can create several shops.
      .values({ id: `owner-${slug}`, name: 'Test Owner', email: `owner-${slug}@trimly.test` })
      .returning({ id: user.id })
    ownerUserId = owner!.id
  }

  const [shop] = await db
    .insert(shops)
    .values({
      ownerUserId,
      name: 'Test Barber',
      slug,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      serviceBufferMinutes: bufferMinutes
    })
    .returning({ id: shops.id })
  const [barber] = await db
    .insert(barbers)
    .values({ shopId: shop!.id, name: 'Faisal' })
    .returning({ id: barbers.id })
  const [haircut, beard, haircutAndBeard] = await db
    .insert(services)
    .values([
      { shopId: shop!.id, name: 'Haircut', priceMinor: 150_00, durationMinutes: 20 },
      { shopId: shop!.id, name: 'Beard', priceMinor: 100_00, durationMinutes: 10 },
      { shopId: shop!.id, name: 'Haircut + Beard', priceMinor: 220_00, durationMinutes: 30 }
    ])
    .returning({ id: services.id })

  return {
    shopId: shop!.id,
    barberId: barber!.id,
    bufferMinutes,
    services: { haircut: haircut!.id, beard: beard!.id, haircutAndBeard: haircutAndBeard!.id }
  }
}
