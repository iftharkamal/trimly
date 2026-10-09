export type DomainErrorCode =
  | 'SHOP_NOT_FOUND'
  | 'BARBER_NOT_FOUND'
  | 'ALREADY_STAFF'
  | 'MEMBER_OF_ANOTHER_SHOP'
  | 'BARBER_HAS_CUSTOMERS'
  | 'LAST_ACTIVE_BARBER'
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_IN_USE'
  | 'NO_BARBER_AVAILABLE'
  | 'ENTRY_NOT_FOUND'
  | 'PHONE_REQUIRED'
  | 'SHOP_CLOSED'
  | 'ALREADY_IN_QUEUE'
  | 'BARBER_BUSY'
  | 'INVALID_TRANSITION'
  | 'APPOINTMENT_NOT_FOUND'
  | 'SLOT_TAKEN'
  | 'ALREADY_BOOKED'
  | 'INVALID_TIME'
  | 'SLOT_UNAVAILABLE'
  | 'ALREADY_HAS_SHOP'
  | 'EMAIL_NOT_VERIFIED'

/**
 * An expected business-rule failure. Services throw it without knowing about
 * HTTP; the API layer turns it into a response using `statusCode` and `code`.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly statusCode: number

  constructor(code: DomainErrorCode, statusCode: number, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.statusCode = statusCode
  }
}
