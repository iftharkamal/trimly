// Development seed: one realistic shop. Run with `pnpm db:seed`.
// Safe to re-run: an existing shop is left alone, except that missing
// opening hours are filled in.
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { useAuth } from '../utils/auth'
import { useDb } from './index'
import { barbers, services, shopHours, shops, user } from './schema'

// Runs outside Nuxt, so load .env ourselves (Node built-in, no dotenv).
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const OWNER = {
  name: 'Faisal',
  email: 'faisal@trimly.local',
  password: process.env.SEED_OWNER_PASSWORD ?? 'trimly-dev-password'
}

const SHOP = {
  name: 'Faisal Barber',
  slug: 'faisal-barber',
  timezone: 'Asia/Kolkata',
  currency: 'INR'
}

const BARBERS = ['Faisal']

// Prices in paise (₹1 = 100).
const SERVICES = [
  { name: 'Haircut', priceMinor: 150_00, durationMinutes: 20 },
  { name: 'Beard', priceMinor: 100_00, durationMinutes: 10 },
  { name: 'Haircut + Beard', priceMinor: 220_00, durationMinutes: 30 }
]

// Mon–Sat 09:00–13:00 and 14:00–20:00 (lunch break), Sunday 10:00–14:00.
const HOURS = [
  ...[1, 2, 3, 4, 5, 6].flatMap(weekday => [
    { weekday, opensAt: '09:00', closesAt: '13:00' },
    { weekday, opensAt: '14:00', closesAt: '20:00' }
  ]),
  { weekday: 7, opensAt: '10:00', closesAt: '14:00' }
]

async function ensureOpeningHours(shopId: string) {
  const db = useDb()
  const existing = await db.query.shopHours.findFirst({ where: eq(shopHours.shopId, shopId), columns: { id: true } })
  if (existing) {
    return
  }
  await db.insert(shopHours).values(HOURS.map(hours => ({ ...hours, shopId })))
  console.log('Added default opening hours.')
}

async function ensureOwner(): Promise<string> {
  const db = useDb()
  const existing = await db.query.user.findFirst({ where: eq(user.email, OWNER.email) })
  if (existing) {
    return existing.id
  }

  // Go through Better Auth so the password is hashed and the account row is created correctly.
  const { user: created } = await useAuth().api.signUpEmail({ body: OWNER })
  return created.id
}

async function seed() {
  const db = useDb()

  const existingShop = await db.query.shops.findFirst({ where: eq(shops.slug, SHOP.slug) })
  if (existingShop) {
    console.log(`Shop "${SHOP.slug}" already exists.`)
    await ensureOpeningHours(existingShop.id)
    return
  }

  const ownerUserId = await ensureOwner()

  const shopId = await db.transaction(async (tx) => {
    const [shop] = await tx
      .insert(shops)
      .values({ ...SHOP, ownerUserId })
      .returning({ id: shops.id })

    if (!shop) {
      throw new Error('Failed to insert shop')
    }

    await tx.insert(barbers).values(BARBERS.map(name => ({ shopId: shop.id, name })))
    await tx.insert(services).values(SERVICES.map(service => ({ ...service, shopId: shop.id })))
    return shop.id
  })
  await ensureOpeningHours(shopId)

  console.log(`Seeded "${SHOP.name}" (/shop/${SHOP.slug}). Owner login: ${OWNER.email} / ${OWNER.password}`)
}

try {
  await seed()
}
finally {
  await useDb().$client.end()
}
