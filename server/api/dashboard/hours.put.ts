import { openingHoursSchema, type OpeningHours } from '../../../shared/schemas/hours'
import { setOpeningHours } from '../../services/shop.service'

// Shop owner only: replace the weekly opening hours (all 7 days).
export default defineApiHandler(async (event): Promise<OpeningHours> => {
  const { shopId } = await requireShopOwner(event)
  const hours = await parseBody(event, openingHoursSchema)
  return setOpeningHours(shopId, hours)
})
