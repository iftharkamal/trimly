import { availabilityQuerySchema } from '../../../../shared/schemas/booking'
import { shopIdParamsSchema } from '../../../../shared/schemas/queue'
import type { AvailabilityDto } from '../../../../shared/types/booking'
import { toAvailabilityDto } from '../../../services/booking.dto'
import { getAvailability } from '../../../services/booking.service'

// Public: bookable times for a service over the booking window.
export default defineApiHandler(async (event): Promise<AvailabilityDto> => {
  const { shopId } = parseParams(event, shopIdParamsSchema)
  const { serviceId, barberId } = parseQuery(event, availabilityQuerySchema)
  return toAvailabilityDto(await getAvailability(shopId, serviceId, barberId ?? null))
})
