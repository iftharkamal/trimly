import { z } from 'zod'
import { isValidCurrency, isValidTimeZone } from '../utils/shop-input'

/** The shop's public link name: /shop/<slug>. */
export const shopSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3–40 lowercase letters, numbers or dashes')

// Strict: the owner comes from the session, never from the body.
export const createShopBodySchema = z.strictObject({
  name: z.string().trim().min(2, 'Enter your shop name').max(60),
  slug: shopSlugSchema,
  timezone: z.string().refine(isValidTimeZone, 'Choose a valid timezone'),
  currency: z.string().trim().toUpperCase().refine(isValidCurrency, 'Choose a valid currency'),
  // The first barber (usually the owner).
  barberName: z.string().trim().min(1, 'Enter a name').max(60)
})

export const slugAvailabilityQuerySchema = z.strictObject({
  slug: z.string().max(100)
})

export type CreateShopBody = z.infer<typeof createShopBodySchema>
