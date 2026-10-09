import { updateShopBodySchema } from '../../../shared/schemas/shop'
import type { ShopProfileDto } from '../../../shared/types/shop'
import { updateShopSettings } from '../../services/shop.service'

// Shop OWNER only: open or close the shop to online joins, and set the gap
// between customers used in waiting-time estimates. The shop comes from the session.
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  return updateShopSettings(shopId, await parseBody(event, updateShopBodySchema))
})
