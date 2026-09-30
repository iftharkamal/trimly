import type { OpeningHours } from '../../../shared/schemas/hours'
import { getOpeningHours } from '../../services/shop.service'

// Shop owner only: the weekly opening hours.
export default defineApiHandler(async (event): Promise<OpeningHours> => {
  const { shopId } = await requireShopOwner(event)
  return getOpeningHours(shopId)
})
