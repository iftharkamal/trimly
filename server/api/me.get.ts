import type { MeDto } from '../../shared/types/account'
import { findShopIdByOwner, getShopProfile } from '../services/shop.service'

// The signed-in user and their shop, from the session (drives onboarding routing).
export default defineApiHandler(async (event): Promise<MeDto> => {
  const user = await requireUser(event)
  const shopId = await findShopIdByOwner(user.id)
  return {
    user: { id: user.id, name: user.name, email: user.email },
    shop: shopId ? await getShopProfile(shopId) : null
  }
})
