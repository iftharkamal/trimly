import { notificationFeedQuerySchema, trackingCodeParamsSchema } from '../../../../shared/schemas/queue'
import type { NotificationFeedDto } from '../../../../shared/types/queue'
import { toNotificationFeedDto } from '../../../services/notifications/notification.dto'
import { listCustomerNotifications } from '../../../services/notifications/notification.service'
import { getQueueEntryByTrackingCode } from '../../../services/queue/queue.service'

// Public: the tracking code is the credential; only this customer's alerts.
export default defineApiHandler(async (event): Promise<NotificationFeedDto> => {
  const { trackingCode } = parseParams(event, trackingCodeParamsSchema)
  const { after } = parseQuery(event, notificationFeedQuerySchema)
  const entry = await getQueueEntryByTrackingCode(trackingCode)
  return toNotificationFeedDto(await listCustomerNotifications(entry.id, after))
})
