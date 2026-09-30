import { createAppointmentBodySchema } from '../../../../shared/schemas/appointment'
import type { AppointmentDto } from '../../../../shared/types/appointment'
import { toAppointmentDto } from '../../../services/appointment.dto'
import { createAppointment } from '../../../services/appointment.service'

// Shop owner only: the barber books an appointment.
export default defineApiHandler(async (event): Promise<AppointmentDto> => {
  const { shopId } = await requireShopOwner(event)
  const body = await parseBody(event, createAppointmentBodySchema)

  const appointment = await createAppointment({
    shopId,
    barberId: body.barberId ?? null,
    customer: { name: body.customer.name, phone: body.customer.phone ?? null },
    serviceId: body.serviceId,
    startsAt: new Date(body.startsAt),
    source: 'BARBER'
  })

  setResponseStatus(event, 201)
  return toAppointmentDto(appointment)
})
