import { z } from 'zod'
import { toIndianMobileE164 } from '../utils/phone-input'
import { isValidCurrency, isValidTimeZone } from '../utils/shop-input'

/**
 * The shop's contact number, stored in E.164. A 10-digit Indian mobile needs
 * no country code; anything else (a landline, another country) needs one.
 */
export const shopPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Enter the shop\'s phone number')
  .transform(value => toIndianMobileE164(value) ?? value.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a 10-digit mobile number, or a landline with its code, e.g. +91 484 234 5678'))

// Strict: the owner comes from the session, never from the body. The link
// name and the first barber are derived on the server.
export const createShopBodySchema = z.strictObject({
  name: z.string().trim().min(2, 'Enter your shop\'s name').max(60, 'Keep the name under 60 characters'),
  phone: shopPhoneSchema,
  address: z.string().trim().max(200, 'Keep the address under 200 characters').optional(),
  currency: z.string().trim().toUpperCase().refine(isValidCurrency, 'Choose a currency'),
  // Sent by the browser, not typed: the shop's local time for "today" and ETAs.
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional()
})

export type CreateShopBody = z.input<typeof createShopBodySchema>
