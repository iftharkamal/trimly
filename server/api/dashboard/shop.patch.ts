import { updateShopBodySchema } from '../../../shared/schemas/shop'
import type { ShopProfileDto } from '../../../shared/types/shop'
import { updateShopSettings } from '../../services/shop.service'

// The shop's queue settings, for the session's shop:
// - isOpen (taking online customers): the owner, and staff (barbers,
//   receptionists) while the owner allows it (staffCanOpenClose);
// - serviceBufferMinutes (gap between customers) and staffCanOpenClose: OWNER only.
// A request that isn't allowed in full changes nothing.
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const { membership, shop } = await getCurrentShopContext(event)
  const body = await parseBody(event, updateShopBodySchema)
  const isOwner = membership.role === 'OWNER'

  if (!isOwner && (body.serviceBufferMinutes !== undefined || body.staffCanOpenClose !== undefined)) {
    throw new ApiError('INSUFFICIENT_ROLE', 403, 'Only the owner can change this setting')
  }
  if (!isOwner && body.isOpen !== undefined && !shop.staffCanOpenClose) {
    throw new ApiError('INSUFFICIENT_ROLE', 403, 'The owner has turned off opening and closing for staff')
  }
  return updateShopSettings(shop.id, body)
})
