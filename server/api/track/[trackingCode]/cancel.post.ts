import { trackingCodeParamsSchema } from '../../../../shared/schemas/queue'
import type { QueueTrackingDto } from '../../../../shared/types/queue'
import { toQueueTrackingDto } from '../../../services/queue/queue.dto'
import { leaveQueue } from '../../../services/queue/queue.service'

// Public: the customer leaves the queue (only while waiting).
export default defineApiHandler(async (event): Promise<QueueTrackingDto> => {
  const { trackingCode } = parseParams(event, trackingCodeParamsSchema)
  return toQueueTrackingDto(await leaveQueue(trackingCode))
})
