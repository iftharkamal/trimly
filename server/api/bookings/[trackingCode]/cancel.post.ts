import { bookingCodeParamsSchema } from '../../../../shared/schemas/booking'
import type { BookingDto } from '../../../../shared/types/booking'
import { toBookingDto } from '../../../services/booking.dto'
import { cancelBooking } from '../../../services/booking.service'

// Public: the customer cancels (only while booked and before it starts).
export default defineApiHandler(async (event): Promise<BookingDto> => {
  const { trackingCode } = parseParams(event, bookingCodeParamsSchema)
  return toBookingDto(await cancelBooking(trackingCode))
})
