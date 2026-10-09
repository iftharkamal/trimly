import { shopIdParamsSchema } from '../../../../shared/schemas/queue'
import { toOwnerQueueDto, toPublicQueueDto } from '../../../services/queue/queue.dto'
import { getActiveQueue } from '../../../services/queue/queue.service'

// Public: anonymized queue. A member of this shop: full queue with customer details.
export default defineApiHandler(async (event) => {
  const { shopId } = parseParams(event, shopIdParamsSchema)
  const queue = await getActiveQueue(shopId)
  return (await getShopMember(event, shopId)) ? toOwnerQueueDto(queue) : toPublicQueueDto(queue)
})
