import { createShopBodySchema } from '../../../shared/schemas/onboarding'
import type { ShopProfileDto } from '../../../shared/types/shop'
import { createShopWithOwner } from '../../services/shop.service'

// Shops are mostly in India; the browser normally sends its own timezone.
const DEFAULT_TIMEZONE = 'Asia/Kolkata'

// A signed-in, verified user without a shop creates one and becomes its OWNER
// (one transaction). The owner is the session's user: the body can't name one
// (strict schema). The first barber is the owner, by name.
export default defineApiHandler(async (event): Promise<ShopProfileDto> => {
  const user = await requireUser(event)
  const body = await parseBody(event, createShopBodySchema)
  const shop = await createShopWithOwner({
    ownerUserId: user.id,
    barberName: user.name,
    name: body.name,
    phone: body.phone,
    address: body.address || null,
    timezone: body.timezone ?? DEFAULT_TIMEZONE,
    currency: body.currency
  })
  setResponseStatus(event, 201)
  return shop
})
