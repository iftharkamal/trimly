import { serviceParamsSchema, updateServiceBodySchema } from '../../../../shared/schemas/service'
import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { updateService } from '../../../services/catalog.service'

// Shop OWNER only: edit or archive one of the shop's own services.
export default defineApiHandler(async (event): Promise<ManagedServiceDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const { id } = parseParams(event, serviceParamsSchema)
  const body = await parseBody(event, updateServiceBodySchema)
  return updateService(shopId, id, body)
})
