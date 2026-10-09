import { z } from 'zod'
import { toIndianMobileE164 } from '../utils/phone-input'

/** The barber's own mobile: how they'll sign in (by OTP), stored as E.164. */
export const staffMobileSchema = z
  .string()
  .trim()
  .min(1, 'Enter their mobile number')
  .transform(value => toIndianMobileE164(value) ?? value)
  .pipe(z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'))

// Strict: the shop comes from the session; role, account and status are the server's.
export const createStaffBodySchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter their name').max(60, 'Keep the name under 60 characters'),
  phone: staffMobileSchema
})

export const updateStaffBodySchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter their name').max(60, 'Keep the name under 60 characters').optional(),
    isActive: z.boolean().optional()
  })
  .refine(body => Object.keys(body).length > 0, 'Change at least one thing')

export const staffParamsSchema = z.strictObject({
  id: z.uuid()
})

export type CreateStaffBody = z.output<typeof createStaffBodySchema>
export type UpdateStaffBody = z.output<typeof updateStaffBodySchema>
