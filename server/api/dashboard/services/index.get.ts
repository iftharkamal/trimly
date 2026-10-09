import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { listManagedServices } from '../../../services/catalog.service'

// Shop OWNER only: every service, archived ones included.
export default defineApiHandler(async (event): Promise<ManagedServiceDto[]> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  return listManagedServices(shopId)
})
