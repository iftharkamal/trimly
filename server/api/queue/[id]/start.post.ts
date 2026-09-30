import { queueEntryParamsSchema } from '../../../../shared/schemas/queue'
import { toOwnerQueueDto } from '../../../services/queue/queue.dto'
import { startService } from '../../../services/queue/queue.service'

// Shop owner only. Returns the recalculated queue.
export default defineApiHandler(async (event) => {
  const { shopId } = await requireShopOwner(event)
  const { id } = parseParams(event, queueEntryParamsSchema)
  return toOwnerQueueDto(await startService(shopId, id))
})
