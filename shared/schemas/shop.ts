import { z } from 'zod'

export const shopSlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Invalid shop link')
})

export const updateShopBodySchema = z.strictObject({
  isOpen: z.boolean()
})

export type UpdateShopBody = z.infer<typeof updateShopBodySchema>
