// Enum values shared by the database schema, Zod schemas and the UI.
// Keep this file dependency-free: it is imported from both app/ and server/.

export const QUEUE_ENTRY_STATUSES = ['waiting', 'in_service', 'completed', 'cancelled', 'no_show'] as const
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number]

export const QUEUE_ENTRY_SOURCES = ['online', 'walk_in'] as const
export type QueueEntrySource = (typeof QUEUE_ENTRY_SOURCES)[number]

export const PAYMENT_METHODS = ['cash', 'card', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
