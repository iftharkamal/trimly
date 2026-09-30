// Request schemas for the queue API. Shared so UI forms validate the same way.
import { z } from 'zod'

// Accepts common separators ("+91 98765-43210") and stores E.164 ("+919876543210").
const phoneSchema = z
  .string()
  .transform(value => value.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter the phone number with country code, e.g. +91 98765 43210'))

export const shopIdParamsSchema = z.object({
  shopId: z.uuid()
})

export const queueEntryParamsSchema = z.object({
  id: z.uuid()
})

// Strict: position, ETA, source or any other extra field is rejected, not ignored.
export const joinQueueBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  phone: phoneSchema.nullish(),
  serviceId: z.uuid(),
  // Omit or null for "any barber".
  barberId: z.uuid().nullish()
})

export type JoinQueueBody = z.infer<typeof joinQueueBodySchema>
