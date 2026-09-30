// Pulls new notifications for an open page (the browser channel's delivery).
// Starts from "now": opening a page never replays old alerts.
import type { NotificationDto, NotificationFeedDto } from '#shared/types/queue'

const POLL_INTERVAL_MS = 15_000

export function useNotificationFeed(
  url: MaybeRefOrGetter<string | null>,
  onNotification: (notification: NotificationDto) => void
) {
  let cursor: number | null = null
  let busy = false

  async function check() {
    const target = toValue(url)
    if (!target || busy) {
      return
    }
    busy = true
    try {
      const { data } = await $fetch<{ data: NotificationFeedDto }>(target, {
        query: cursor === null ? {} : { after: cursor }
      })
      // The first call only sets the starting point.
      if (cursor !== null) {
        data.notifications.forEach(onNotification)
      }
      cursor = data.cursor
    }
    catch {
      // Try again on the next tick.
    }
    finally {
      busy = false
    }
  }

  onMounted(check)
  usePolling(check, POLL_INTERVAL_MS)

  return { check }
}
