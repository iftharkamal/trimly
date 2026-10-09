import type { OpeningHours } from '../../../shared/schemas/hours'
import { getOpeningHours } from '../../services/shop.service'

// Any member of the shop (owner or barber): the weekly opening hours.
export default defineApiHandler(async (event): Promise<OpeningHours> => {
  const { shopId } = await requireShopMember(event)
  return getOpeningHours(shopId)
})
