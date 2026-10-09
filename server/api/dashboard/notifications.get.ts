import { notificationFeedQuerySchema } from '../../../shared/schemas/queue'
import type { NotificationFeedDto } from '../../../shared/types/queue'
import { toNotificationFeedDto } from '../../services/notifications/notification.dto'
import { listShopNotifications } from '../../services/notifications/notification.service'

// Any member of the shop (owner or barber): new joins, bookings and cancellations (?after=<cursor>).
export default defineApiHandler(async (event): Promise<NotificationFeedDto> => {
  const { shopId } = await requireShopMember(event)
  const { after } = parseQuery(event, notificationFeedQuerySchema)
  return toNotificationFeedDto(await listShopNotifications(shopId, after))
})
