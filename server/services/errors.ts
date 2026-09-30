export type DomainErrorCode =
  | 'SHOP_NOT_FOUND'
  | 'BARBER_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
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
