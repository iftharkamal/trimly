import type { StaffMemberDto } from '../../../../shared/types/staff'
import { listStaff } from '../../../services/staff.service'

// Shop OWNER only: the shop's barbers, their accounts and what they're doing now.
export default defineApiHandler(async (event): Promise<StaffMemberDto[]> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  return listStaff(shopId)
})
