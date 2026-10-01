import { joinQueueBodySchema, shopIdParamsSchema } from '../../../../shared/schemas/queue'
import type { JoinQueueResultDto } from '../../../../shared/types/queue'
import { toQueueEntryStatusDto } from '../../../services/queue/queue.dto'
import { addCustomer } from '../../../services/queue/queue.service'

// Public: an online join (phone required, rate limited). Shop owner: a walk-in (phone optional).
export default defineApiHandler(async (event): Promise<JoinQueueResultDto> => {
  const { shopId } = parseParams(event, shopIdParamsSchema)
  const body = await parseBody(event, joinQueueBodySchema)
  const isOwner = await isShopOwner(event, shopId)
  if (!isOwner) {
    await enforcePublicLimits(event, 'queue-join', shopId, body.phone ?? null)
  }

  const { trackingCode, entry } = await addCustomer({
    shopId,
    customer: { name: body.name, phone: body.phone ?? null },
    serviceId: body.serviceId,
    barberId: body.barberId ?? null,
    source: isOwner ? 'WALK_IN' : 'ONLINE'
  })

  setResponseStatus(event, 201)
  return { trackingCode, entry: toQueueEntryStatusDto(entry) }
})
