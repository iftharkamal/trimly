import { createServiceBodySchema } from '../../../../shared/schemas/service'
import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { createService } from '../../../services/catalog.service'

// Shop OWNER only: add a service.
export default defineApiHandler(async (event): Promise<ManagedServiceDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const body = await parseBody(event, createServiceBodySchema)
  setResponseStatus(event, 201)
  return createService(shopId, body)
})
