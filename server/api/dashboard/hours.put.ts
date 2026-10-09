import { openingHoursSchema, type OpeningHours } from '../../../shared/schemas/hours'
import { setOpeningHours } from '../../services/shop.service'

// Shop OWNER only: replace the weekly opening hours (all 7 days).
export default defineApiHandler(async (event): Promise<OpeningHours> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const hours = await parseBody(event, openingHoursSchema)
  return setOpeningHours(shopId, hours)
})
