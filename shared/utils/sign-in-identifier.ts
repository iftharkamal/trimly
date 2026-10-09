// "Email or mobile number" in one field: which one did the person type?
import { z } from 'zod'
import { toIndianMobileE164 } from './phone-input'

export type SignInIdentifier =
  | { kind: 'email', email: string }
  | { kind: 'phone', phoneNumber: string }

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

/** Email (lower-cased) or Indian mobile (E.164), or null if it's neither. */
export function parseSignInIdentifier(input: string): SignInIdentifier | null {
  const value = input.trim()
  if (value.includes('@')) {
    const email = emailSchema.safeParse(value)
    return email.success ? { kind: 'email', email: email.data } : null
  }
  const phoneNumber = toIndianMobileE164(value)
  return phoneNumber ? { kind: 'phone', phoneNumber } : null
}

/** Which kind the input looks like while it's still being typed (an "@" means email). */
export function looksLikeEmail(input: string): boolean {
  return input.includes('@')
}
