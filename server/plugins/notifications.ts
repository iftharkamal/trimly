// Connects notifications to domain events at server start. Business code
// only emits events; this is the one place that decides they notify someone.
import { onDomainEvent } from '../services/events/bus'
import { publishNotification } from '../services/notifications/notification.service'

export default defineNitroPlugin(() => {
  onDomainEvent(async (event) => {
    await publishNotification(event)
  })
})
