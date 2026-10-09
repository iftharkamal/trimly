// Human messages for Better Auth errors (email and phone sign-in).

export interface AuthError {
  code?: string
  message?: string
  status: number
}

export function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password don\'t match.'
    case 'INVALID_PHONE_NUMBER':
      return 'Enter a valid Indian mobile number.'
    case 'INVALID_OTP':
      return 'That code isn\'t right. Check it and try again.'
    case 'OTP_EXPIRED':
    case 'OTP_NOT_FOUND':
      return 'This code has expired. Send a new one.'
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many wrong codes. Send a new one.'
    case 'PHONE_NUMBER_EXIST':
      return 'This number is already used by another Trimly account.'
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters.'
    case 'TOO_MANY_CODES':
    case 'PHONE_SIGN_IN_UNAVAILABLE':
      return error.message ?? 'Please try again later.'
  }
  if (error.status === 429) {
    return 'Too many attempts. Wait a minute and try again.'
  }
  return error.message ?? 'Something went wrong. Please try again.'
}

/** Only same-site paths, so sign-in pages can't be used to send people elsewhere. */
export function safeRedirect(value: unknown, fallback = '/dashboard'): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}
