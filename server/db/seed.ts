// Development seed: one realistic shop. Run with `pnpm db:seed`.
// Safe to re-run: exits early if the shop already exists.
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { useAuth } from '../utils/auth'
import { useDb } from './index'
import { barbers, services, shops, user } from './schema'

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
    console.log(`Shop "${SHOP.slug}" already exists, nothing to do.`)
    return
  }

  const ownerUserId = await ensureOwner()

  await db.transaction(async (tx) => {
    const [shop] = await tx
      .insert(shops)
      .values({ ...SHOP, ownerUserId })
      .returning({ id: shops.id })

    if (!shop) {
      throw new Error('Failed to insert shop')
    }

    await tx.insert(barbers).values(BARBERS.map(name => ({ shopId: shop.id, name })))
    await tx.insert(services).values(SERVICES.map(service => ({ ...service, shopId: shop.id })))
  })

  console.log(`Seeded "${SHOP.name}" (/s/${SHOP.slug}). Owner login: ${OWNER.email} / ${OWNER.password}`)
}

try {
  await seed()
}
finally {
  await useDb().$client.end()
}
