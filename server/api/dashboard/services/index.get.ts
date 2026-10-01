import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { listManagedServices } from '../../../services/catalog.service'

// Shop owner only: every service, archived ones included.
export default defineApiHandler(async (event): Promise<ManagedServiceDto[]> => {
  const { shopId } = await requireShopOwner(event)
  return listManagedServices(shopId)
})
