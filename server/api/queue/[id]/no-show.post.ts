import { queueEntryParamsSchema } from '../../../../shared/schemas/queue'
import { toOwnerQueueDto } from '../../../services/queue/queue.dto'
import { markNoShow } from '../../../services/queue/queue.service'

// Any member of the shop (owner or barber). Returns the recalculated queue.
export default defineApiHandler(async (event) => {
  const { shopId } = await requireShopMember(event)
  const { id } = parseParams(event, queueEntryParamsSchema)
  return toOwnerQueueDto(await markNoShow(shopId, id))
})
