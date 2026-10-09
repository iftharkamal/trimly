import type { DashboardDto } from '../../shared/types/dashboard'
import { findChairOfMember, listActiveBarbers } from '../services/barber.service'
import { findShopOwner } from '../services/membership.service'
import { getTodayRevenue } from '../services/payment.service'
import { getTodayStats } from '../services/queue/queue.service'

// Any member of the shop: the shop (from the session: user → membership →
// shop), who is signed in, who owns it, and today's numbers.
export default defineApiHandler(async (event): Promise<DashboardDto> => {
  const { user, membership, shop } = await getCurrentShopContext(event)
  const [owner, chairId, stats, revenueMinor, barbers] = await Promise.all([
    findShopOwner(shop.id),
    findChairOfMember(membership.id),
    getTodayStats(shop.id),
    getTodayRevenue(shop.id),
    listActiveBarbers(shop.id)
  ])
  return {
    shop,
    member: { name: user.name, role: membership.role, barberId: chairId },
    owner: owner ? { name: owner.name } : null,
    barbers,
    today: { ...stats, revenueMinor }
  }
})
