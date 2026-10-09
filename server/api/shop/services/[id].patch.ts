import { serviceParamsSchema, updateServiceBodySchema } from '../../../../shared/schemas/service'
import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { toManagedServiceDto, updateService } from '../../../services/catalog.service'

// Shop OWNER only: edit or archive one of the session's shop's services (another shop's is 404).
export default defineApiHandler(async (event): Promise<ManagedServiceDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const { id } = parseParams(event, serviceParamsSchema)
  const body = await parseBody(event, updateServiceBodySchema)
  return toManagedServiceDto(await updateService(shopId, id, body))
})
