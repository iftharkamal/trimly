import type { DashboardDto } from '../../shared/types/dashboard'
import { listActiveBarbers } from '../services/barber.service'
import { getTodayRevenue } from '../services/payment.service'
import { getTodayStats } from '../services/queue/queue.service'
import { getShopProfile } from '../services/shop.service'

// Any member of the shop: their shop, who they are in it, and today's numbers.
export default defineApiHandler(async (event): Promise<DashboardDto> => {
  const { user, role, shopId } = await requireShopMember(event)
  const [shop, stats, revenueMinor, barbers] = await Promise.all([
    getShopProfile(shopId),
    getTodayStats(shopId),
    getTodayRevenue(shopId),
    listActiveBarbers(shopId)
  ])
  return { shop, member: { name: user.name, role }, barbers, today: { ...stats, revenueMinor } }
})
