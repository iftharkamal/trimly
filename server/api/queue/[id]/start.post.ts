import { queueEntryParamsSchema } from '../../../../shared/schemas/queue'
import { toOwnerQueueDto } from '../../../services/queue/queue.dto'
import { startService } from '../../../services/queue/queue.service'

// Any member of the shop (owner or barber). Returns the recalculated queue.
export default defineApiHandler(async (event) => {
  const { shopId } = await requireShopMember(event)
  const { id } = parseParams(event, queueEntryParamsSchema)
  return toOwnerQueueDto(await startService(shopId, id))
})
