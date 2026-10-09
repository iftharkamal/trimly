import { createServiceBodySchema } from '../../../../shared/schemas/service'
import type { ManagedServiceDto } from '../../../../shared/types/dashboard'
import { createService, toManagedServiceDto } from '../../../services/catalog.service'

// Shop OWNER only: add a service to the session's shop (the body has no shopId; strict schema).
export default defineApiHandler(async (event): Promise<ManagedServiceDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const body = await parseBody(event, createServiceBodySchema)
  setResponseStatus(event, 201)
  return toManagedServiceDto(await createService(shopId, body))
})
