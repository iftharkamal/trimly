import { updateShopBodySchema } from '../../../shared/schemas/shop'
import type { ShopProfileDto } from '../../../shared/types/shop'
import { updateShopSettings } from '../../services/shop.service'

// The shop's queue settings, for the session's shop:
// - isOpen (taking online customers): any member, so whoever opens up in the
//   morning can switch it on;
// - serviceBufferMinutes (gap between customers): OWNER only.
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const { shopId, role } = await requireShopMember(event)
  const body = await parseBody(event, updateShopBodySchema)
  if (body.serviceBufferMinutes !== undefined && role !== 'OWNER') {
    throw new ApiError('INSUFFICIENT_ROLE', 403, 'Only the owner can change the time between customers')
  }
  return updateShopSettings(shopId, body)
})
