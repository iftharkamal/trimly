import { updateShopBodySchema } from '../../../shared/schemas/shop'
import type { ShopProfileDto } from '../../../shared/types/shop'
import { setShopOpen } from '../../services/shop.service'

// Shop owner only: open or close the shop to online joins.
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const { shopId } = await requireShopOwner(event)
  const { isOpen } = await parseBody(event, updateShopBodySchema)
  return setShopOpen(shopId, isOpen)
})
