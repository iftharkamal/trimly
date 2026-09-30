import type { DashboardDto } from '../../shared/types/dashboard'
import { getTodayRevenue } from '../services/payment.service'
import { getTodayStats } from '../services/queue/queue.service'
import { getShopProfile } from '../services/shop.service'

// Shop owner only: the signed-in owner's shop and today's numbers.
export default defineApiHandler(async (event): Promise<DashboardDto> => {
  const { userName, shopId } = await requireShopOwner(event)
  const [shop, stats, revenueMinor] = await Promise.all([
    getShopProfile(shopId),
    getTodayStats(shopId),
    getTodayRevenue(shopId)
  ])
  return { shop, owner: { name: userName }, today: { ...stats, revenueMinor } }
})
