import type { DashboardDto } from '../../shared/types/dashboard'
import { listActiveBarbers } from '../services/barber.service'
import { findShopOwner } from '../services/membership.service'
import { getTodayRevenue } from '../services/payment.service'
import { getTodayStats } from '../services/queue/queue.service'

// Any member of the shop: the shop (from the session: user → membership →
// shop), who is signed in, who owns it, and today's numbers.
export default defineApiHandler(async (event): Promise<DashboardDto> => {
  const { user, membership, shop } = await getCurrentShopContext(event)
  const [owner, stats, revenueMinor, barbers] = await Promise.all([
    findShopOwner(shop.id),
    getTodayStats(shop.id),
    getTodayRevenue(shop.id),
    listActiveBarbers(shop.id)
  ])
  return {
    shop,
    member: { name: user.name, role: membership.role },
    owner: owner ? { name: owner.name } : null,
    barbers,
    today: { ...stats, revenueMinor }
  }
})
