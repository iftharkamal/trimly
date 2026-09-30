// Every minute: waits shrink as time passes, so "getting close" can happen
// without anything else changing. Customers are notified once each.
import { checkQueueProximity, listShopIdsWithWaiting } from '../../services/queue/queue.service'

export default defineTask({
  meta: {
    name: 'notifications:proximity',
    description: 'Notify waiting customers whose turn is getting close'
  },
  async run() {
    const shopIds = await listShopIdsWithWaiting()
    for (const shopId of shopIds) {
      await checkQueueProximity(shopId)
    }
    return { result: { shopsChecked: shopIds.length } }
  }
})
