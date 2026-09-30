import { onlineBookingBodySchema } from '../../../../shared/schemas/booking'
import { shopIdParamsSchema } from '../../../../shared/schemas/queue'
import type { OnlineBookingResultDto } from '../../../../shared/types/booking'
import { toBookingDto } from '../../../services/booking.dto'
import { bookOnline, getBooking } from '../../../services/booking.service'

// Public: a customer books one of the offered slots.
export default defineApiHandler(async (event): Promise<OnlineBookingResultDto> => {
  const { shopId } = parseParams(event, shopIdParamsSchema)
  const body = await parseBody(event, onlineBookingBodySchema)

  const appointment = await bookOnline({
    shopId,
    serviceId: body.serviceId,
    barberId: body.barberId ?? null,
    customer: { name: body.customer.name, phone: body.customer.phone },
    startsAt: new Date(body.startsAt)
  })

  setResponseStatus(event, 201)
  return { trackingCode: appointment.trackingCode, booking: toBookingDto(await getBooking(appointment.trackingCode)) }
})
