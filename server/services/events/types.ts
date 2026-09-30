// What happened in the shop. Plain data: no channels, no message wording.

export type DomainEvent =
  /** A waiting customer's estimated wait is now within the "getting close" threshold. */
  | {
    type: 'QUEUE_GETTING_CLOSE'
    shopId: string
    shopName: string
    entryId: string
    position: number
    waitMinutes: number
  }
  | {
    type: 'CUSTOMER_JOINED_ONLINE'
    shopId: string
    entryId: string
    customerName: string
    serviceName: string
    position: number | null
  }
  /** The customer left through their tracking link. */
  | {
    type: 'CUSTOMER_LEFT_QUEUE'
    shopId: string
    entryId: string
    customerName: string
  }
  | {
    type: 'APPOINTMENT_BOOKED_ONLINE'
    shopId: string
    appointmentId: string
    customerName: string
    serviceName: string
    startsAt: Date
    timeZone: string
  }
  /** The customer cancelled through their booking link. */
  | {
    type: 'APPOINTMENT_CANCELLED_BY_CUSTOMER'
    shopId: string
    appointmentId: string
    customerName: string
    startsAt: Date
    timeZone: string
  }
