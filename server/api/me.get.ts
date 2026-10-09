import type { MeDto } from '../../shared/types/account'
import { findMembership } from '../services/membership.service'
import { getShopProfile } from '../services/shop.service'

// The signed-in user, their shop and their role in it, from the session
// (drives onboarding and which pages the UI offers).
export default defineApiHandler(async (event): Promise<MeDto> => {
  const user = await requireUser(event)
  const membership = await findMembership(user.id)
  return {
    user: { id: user.id, name: user.name, email: user.email, phoneNumber: user.phoneNumber },
    shop: membership ? await getShopProfile(membership.shopId) : null,
    role: membership?.role ?? null
  }
})
