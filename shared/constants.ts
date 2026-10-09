// Enum values shared by the database schema, Zod schemas and the UI.
// Keep this file dependency-free: it is imported from both app/ and server/.

// What a person can do in a shop (shop_members.role). RECEPTIONIST comes later.
export const MEMBER_ROLES = ['OWNER', 'BARBER'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const QUEUE_ENTRY_STATUSES = ['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number]

// APPOINTMENT: created by checking in a booked appointment.
export const QUEUE_ENTRY_SOURCES = ['ONLINE', 'WALK_IN', 'APPOINTMENT'] as const
export type QueueEntrySource = (typeof QUEUE_ENTRY_SOURCES)[number]

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'REFUNDED'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'OTHER'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// How a queue entry is presented to its customer. Derived on the server from
// status, position and estimated wait; never stored.
export const TRACKING_STATES = ['WAITING', 'GETTING_CLOSE', 'YOU_ARE_NEXT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
export type TrackingState = (typeof TRACKING_STATES)[number]

/** A waiting customer is "getting close" once the estimated wait is this short. */
export const GETTING_CLOSE_MINUTES = 15

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  OTHER: 'Other'
}

export const REPORT_PERIODS = ['day', 'week', 'month'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

// CHECKED_IN hands the visit over to the queue (which tracks the service itself).
export const APPOINTMENT_STATUSES = ['BOOKED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

// Who made the booking: the customer online, or the barber from the dashboard.
export const BOOKING_SOURCES = ['ONLINE', 'BARBER'] as const
export type BookingSource = (typeof BOOKING_SOURCES)[number]

// Online booking rules (shop time).
export const BOOKING_WINDOW_DAYS = 14
export const BOOKING_NOTICE_MINUTES = 30
export const SLOT_STEP_MINUTES = 15

// Who a notification is for: the shop (barber dashboard) or one customer.
export const NOTIFICATION_AUDIENCES = ['SHOP', 'CUSTOMER'] as const
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number]

export const NOTIFICATION_TYPES = [
  // To a customer
  'QUEUE_GETTING_CLOSE',
  // To the shop
  'CUSTOMER_JOINED_ONLINE',
  'CUSTOMER_LEFT_QUEUE',
  'APPOINTMENT_BOOKED_ONLINE',
  'APPOINTMENT_CANCELLED_BY_CUSTOMER'
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
