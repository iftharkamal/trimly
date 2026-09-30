import { shopIdParamsSchema } from '../../../../shared/schemas/queue'
import type { ServiceDto } from '../../../../shared/types/dashboard'
import { listActiveServices } from '../../../services/catalog.service'

// Public: the services a customer can choose when joining.
export default defineApiHandler(async (event): Promise<ServiceDto[]> => {
  const { shopId } = parseParams(event, shopIdParamsSchema)
  return listActiveServices(shopId)
})
