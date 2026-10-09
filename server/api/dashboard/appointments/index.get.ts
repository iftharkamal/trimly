import { listAppointmentsQuerySchema } from '../../../../shared/schemas/appointment'
import type { AppointmentDto } from '../../../../shared/types/appointment'
import { toAppointmentDto } from '../../../services/appointment.dto'
import { listAppointments } from '../../../services/appointment.service'
import { localDateRange } from '../../../services/day-range'
import { getShopProfile } from '../../../services/shop.service'

// Any member of the shop (owner or barber): ?from=YYYY-MM-DD&to=YYYY-MM-DD (shop dates, "to" exclusive).
export default defineApiHandler(async (event): Promise<AppointmentDto[]> => {
  const { shopId } = await requireShopMember(event)
  const { from, to } = parseQuery(event, listAppointmentsQuerySchema)
  const shop = await getShopProfile(shopId)
  const appointments = await listAppointments(shopId, localDateRange(shop.timezone, from, to))
  return appointments.map(toAppointmentDto)
})
