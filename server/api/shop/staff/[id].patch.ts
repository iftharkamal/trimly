import { staffParamsSchema, updateStaffBodySchema } from '../../../../shared/schemas/staff'
import type { StaffMemberDto } from '../../../../shared/types/staff'
import { listStaff, updateStaff } from '../../../services/staff.service'

// Shop OWNER only: rename, deactivate ({ isActive: false }) or reactivate a
// barber of the session's shop (another shop's is 404).
export default defineApiHandler(async (event): Promise<StaffMemberDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const { id } = parseParams(event, staffParamsSchema)
  const body = await parseBody(event, updateStaffBodySchema)
  await updateStaff(shopId, id, body)
  return (await listStaff(shopId)).find(member => member.id === id)!
})
