import type { NotificationFeedDto } from '../../../shared/types/queue'
import type { NotificationPage } from './notification.service'

export function toNotificationFeedDto(page: NotificationPage): NotificationFeedDto {
  return {
    cursor: page.cursor,
    notifications: page.notifications.map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt.toISOString()
    }))
  }
}
