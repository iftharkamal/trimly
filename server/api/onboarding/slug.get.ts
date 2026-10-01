import { shopSlugSchema, slugAvailabilityQuerySchema } from '../../../shared/schemas/onboarding'
import type { SlugAvailabilityDto } from '../../../shared/types/account'
import { isSlugAvailable } from '../../services/shop.service'

// Signed-in users only: is this link name free?
export default defineApiHandler(async (event): Promise<SlugAvailabilityDto> => {
  await requireUser(event)
  const { slug: raw } = parseQuery(event, slugAvailabilityQuerySchema)
  const parsed = shopSlugSchema.safeParse(raw)
  if (!parsed.success) {
    return { slug: raw, available: false }
  }
  return { slug: parsed.data, available: await isSlugAvailable(parsed.data) }
})
