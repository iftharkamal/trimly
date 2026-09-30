import { appointmentParamsSchema } from '../../../../../shared/schemas/appointment'
import { checkInAppointment } from '../../../../services/checkin.service'
import { toOwnerQueueDto } from '../../../../services/queue/queue.dto'

// Shop owner only: the customer has arrived. Returns the recalculated queue.
export default defineApiHandler(async (event) => {
  const { shopId } = await requireShopOwner(event)
  const { id } = parseParams(event, appointmentParamsSchema)
  return toOwnerQueueDto(await checkInAppointment(shopId, id))
})
