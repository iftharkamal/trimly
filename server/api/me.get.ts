import type { MeDto } from '../../shared/types/account'
import { listMemberships } from '../services/membership.service'
import { getShopProfile } from '../services/shop.service'

// The signed-in user and the shops they belong to, from the session (drives
// onboarding and which pages the UI offers). `shop` and `role` are the
// current shop: the only one, or null with none (or with several, which
// needs a choice the app can't offer yet).
export default defineApiHandler(async (event): Promise<MeDto> => {
  const user = await requireUser(event)
  const memberships = await Promise.all(
    (await listMemberships(user.id)).map(async membership => ({ role: membership.role, shop: await getShopProfile(membership.shopId) }))
  )
  const current = memberships.length === 1 ? memberships[0]! : null
  return {
    user: { id: user.id, name: user.name, email: user.email, phoneNumber: user.phoneNumber },
    shop: current?.shop ?? null,
    role: current?.role ?? null,
    memberships
  }
})
