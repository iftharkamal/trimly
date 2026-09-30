import { trackingCodeParamsSchema } from '../../../shared/schemas/queue'
import type { QueueTrackingDto } from '../../../shared/types/queue'
import { toQueueTrackingDto } from '../../services/queue/queue.dto'
import { getTracking } from '../../services/queue/queue.service'

// Public: the tracking code itself is the credential.
export default defineApiHandler(async (event): Promise<QueueTrackingDto> => {
  const { trackingCode } = parseParams(event, trackingCodeParamsSchema)
  return toQueueTrackingDto(await getTracking(trackingCode))
})
