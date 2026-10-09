import { completeServiceBodySchema } from '../../../../shared/schemas/payment'
import { queueEntryParamsSchema } from '../../../../shared/schemas/queue'
import { toOwnerQueueDto } from '../../../services/queue/queue.dto'
import { completeService } from '../../../services/queue/queue.service'

// Any member of the shop (owner or barber). Completes the service and, if given, records the payment
// in the same transaction. Returns the recalculated queue.
export default defineApiHandler(async (event) => {
  const { shopId } = await requireShopMember(event)
  const { id } = parseParams(event, queueEntryParamsSchema)
  const body = await parseBody(event, completeServiceBodySchema)
  return toOwnerQueueDto(await completeService(shopId, id, body?.payment))
})
