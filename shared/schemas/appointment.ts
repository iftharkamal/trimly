import { z } from 'zod'
import { phoneSchema } from './queue'

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-30')

export const appointmentParamsSchema = z.object({
  id: z.uuid()
})

// Barber booking from the dashboard. Phone is optional here (a regular they know).
export const createAppointmentBodySchema = z.strictObject({
  customer: z.strictObject({
    name: z.string().trim().min(1).max(80),
    phone: phoneSchema.nullish()
  }),
  serviceId: z.uuid(),
  // Omit or null for "any barber".
  barberId: z.uuid().nullish(),
  // With an offset, e.g. "2026-10-01T10:30:00+05:30".
  startsAt: z.iso.datetime({ offset: true })
})

// Appointments starting on local dates [from, to), at most ~2 months at once.
export const listAppointmentsQuerySchema = z
  .strictObject({ from: localDateSchema, to: localDateSchema })
  .refine(query => query.from < query.to, { message: '"to" must be after "from"', path: ['to'] })
  .refine(
    query => (Date.parse(query.to) - Date.parse(query.from)) / 86_400_000 <= 62,
    { message: 'At most 62 days at a time', path: ['to'] }
  )

export type CreateAppointmentBody = z.infer<typeof createAppointmentBodySchema>
