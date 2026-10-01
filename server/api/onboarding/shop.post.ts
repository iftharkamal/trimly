import { createShopBodySchema } from '../../../shared/schemas/onboarding'
import type { ShopProfileDto } from '../../../shared/types/shop'
import { createShopForOwner } from '../../services/shop.service'

// Signed-in, verified users without a shop: create it. The owner is the
// session's user; the body can't name one (strict schema).
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const user = await requireUser(event)
  const body = await parseBody(event, createShopBodySchema)
  const shop = await createShopForOwner({ ownerUserId: user.id, ...body })
  setResponseStatus(event, 201)
  return shop
})
