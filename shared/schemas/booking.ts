// Public online booking.
import { z } from 'zod'
import { phoneSchema } from './queue'

export const availabilityQuerySchema = z.strictObject({
  serviceId: z.uuid(),
  // Omit for "any barber".
  barberId: z.uuid().optional()
})

// Online customers must give a phone number (like joining the queue online).
export const onlineBookingBodySchema = z.strictObject({
  customer: z.strictObject({
    name: z.string().trim().min(1).max(80),
    phone: phoneSchema
  }),
  serviceId: z.uuid(),
  barberId: z.uuid().nullish(),
  // One of the offered slots, e.g. "2026-10-02T04:30:00.000Z".
  startsAt: z.iso.datetime({ offset: true })
})

export const bookingCodeParamsSchema = z.object({
  trackingCode: z.uuid()
})

export type OnlineBookingBody = z.infer<typeof onlineBookingBodySchema>
