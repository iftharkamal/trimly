import { z } from 'zod'

const fields = {
  name: z.string().trim().min(1, 'Enter a name').max(60),
  durationMinutes: z.int('Whole minutes').min(5, 'At least 5 minutes').max(480, 'At most 8 hours'),
  // Minor units (paise for INR).
  priceMinor: z.int().min(0, 'Can\'t be negative').max(100_000_00)
}

export const createServiceBodySchema = z.strictObject(fields)

// Archive with isActive: false (kept for history) instead of deleting.
export const updateServiceBodySchema = z
  .strictObject({
    name: fields.name.optional(),
    durationMinutes: fields.durationMinutes.optional(),
    priceMinor: fields.priceMinor.optional(),
    isActive: z.boolean().optional()
  })
  .refine(body => Object.values(body).some(value => value !== undefined), 'Nothing to update')

export const serviceParamsSchema = z.object({
  id: z.uuid()
})

export type CreateServiceBody = z.infer<typeof createServiceBodySchema>
export type UpdateServiceBody = z.infer<typeof updateServiceBodySchema>
