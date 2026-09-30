import { shopSlugParamsSchema } from '../../../../shared/schemas/shop'
import type { ShopProfileDto } from '../../../../shared/types/shop'
import { getShopProfileBySlug } from '../../../services/shop.service'

// Public: the shop behind a /shop/:slug link, including whether it's open.
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const { slug } = parseParams(event, shopSlugParamsSchema)
  return getShopProfileBySlug(slug)
})
