import { z } from 'zod'

export const shopSlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Invalid shop link')
})

/** Upper limit for the gap between customers. */
export const MAX_SERVICE_BUFFER_MINUTES = 60

// Strict: only these settings; the shop comes from the session.
export const updateShopBodySchema = z
  .strictObject({
    // Online joining on/off.
    isOpen: z.boolean().optional(),
    // The gap between one customer finishing and the next starting (cleaning
    // up, taking payment), added to every waiting-time estimate.
    serviceBufferMinutes: z
      .int('Use whole minutes')
      .min(0, 'Can\'t be negative')
      .max(MAX_SERVICE_BUFFER_MINUTES, `At most ${MAX_SERVICE_BUFFER_MINUTES} minutes`)
      .optional(),
    // Owner only: may barbers and receptionists open and close the shop?
    staffCanOpenClose: z.boolean().optional()
  })
  .refine(body => Object.keys(body).length > 0, 'Change at least one setting')

export type UpdateShopBody = z.infer<typeof updateShopBodySchema>
