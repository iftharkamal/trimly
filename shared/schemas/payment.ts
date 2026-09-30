import { z } from 'zod'
import { PAYMENT_METHODS } from '../constants'

/** Up to 1,00,000.00 in the shop's currency (minor units). */
const MAX_AMOUNT_MINOR = 100_000_00

export const paymentInputSchema = z.strictObject({
  method: z.enum(PAYMENT_METHODS),
  // Prefilled with the service price; the barber may adjust it (discount, tip).
  amountMinor: z.int().min(0).max(MAX_AMOUNT_MINOR)
})

export type PaymentInput = z.infer<typeof paymentInputSchema>

// Body is optional: completing without a payment records none.
export const completeServiceBodySchema = z
  .strictObject({
    payment: paymentInputSchema.nullish()
  })
  .optional()
