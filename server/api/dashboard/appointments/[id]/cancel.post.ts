import { appointmentParamsSchema } from '../../../../../shared/schemas/appointment'
import type { AppointmentDto } from '../../../../../shared/types/appointment'
import { toAppointmentDto } from '../../../../services/appointment.dto'
import { cancelAppointment } from '../../../../services/appointment.service'

// Any member of the shop (owner or barber): only a BOOKED appointment can be changed.
export default defineApiHandler(async (event): Promise<AppointmentDto> => {
  const { shopId } = await requireShopMember(event)
  const { id } = parseParams(event, appointmentParamsSchema)
  return toAppointmentDto(await cancelAppointment(shopId, id))
})
