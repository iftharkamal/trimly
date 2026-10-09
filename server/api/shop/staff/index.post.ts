import { createStaffBodySchema } from '../../../../shared/schemas/staff'
import type { StaffMemberDto } from '../../../../shared/types/staff'
import { addBarber, listStaff } from '../../../services/staff.service'

// Shop OWNER only: add a barber by name and mobile. Linked to that person's
// account now if the number is verified, otherwise when they first verify it.
// The shop comes from the session (strict body: no shopId, role or account).
export default defineApiHandler(async (event): Promise<StaffMemberDto> => {
  const { shopId } = await requireRole(event, ['OWNER'])
  const body = await parseBody(event, createStaffBodySchema)
  const id = await addBarber(shopId, body)
  setResponseStatus(event, 201)
  return (await listStaff(shopId)).find(member => member.id === id)!
})
