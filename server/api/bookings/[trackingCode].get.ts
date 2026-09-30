import { bookingCodeParamsSchema } from '../../../shared/schemas/booking'
import type { BookingDto } from '../../../shared/types/booking'
import { toBookingDto } from '../../services/booking.dto'
import { getBooking } from '../../services/booking.service'

// Public: the booking code itself is the credential.
export default defineApiHandler(async (event): Promise<BookingDto> => {
  const { trackingCode } = parseParams(event, bookingCodeParamsSchema)
  return toBookingDto(await getBooking(trackingCode))
})
