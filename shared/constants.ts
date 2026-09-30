// Enum values shared by the database schema, Zod schemas and the UI.
// Keep this file dependency-free: it is imported from both app/ and server/.

export const QUEUE_ENTRY_STATUSES = ['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number]

export const QUEUE_ENTRY_SOURCES = ['ONLINE', 'WALK_IN'] as const
export type QueueEntrySource = (typeof QUEUE_ENTRY_SOURCES)[number]

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'REFUNDED'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'OTHER'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
