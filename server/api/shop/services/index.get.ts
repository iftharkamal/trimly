import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { listManagedServices, toManagedServiceDto } from '../../../services/catalog.service'

// Any member of the shop: every service, archived ones included. The shop
// comes from the session.
export default defineApiHandler(async (event): Promise<ManagedServiceDto[]> => {
  const { shopId } = await requireShopMember(event)
  return (await listManagedServices(shopId)).map(toManagedServiceDto)
})
