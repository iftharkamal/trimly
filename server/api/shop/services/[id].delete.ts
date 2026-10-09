import { serviceParamsSchema } from '../../../../shared/schemas/service'
import { deleteService } from '../../../services/catalog.service'

// Shop OWNER only: delete a service that has never been used (409
// SERVICE_IN_USE otherwise: archive it with PATCH { isActive: false }).
// The shop comes from the session; another shop's service is 404.
export default defineApiHandler(async (event): Promise<{ id: string }> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const { id } = parseParams(event, serviceParamsSchema)
  await deleteService(shopId, id)
  return { id }
})
