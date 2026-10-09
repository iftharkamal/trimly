// What people type for an Indian mobile number → E.164, the only format the
// server accepts for sign-in ("98765 43210", "+91 98765-43210", "919876543210"
// → "+919876543210"). Null if it isn't a 10-digit mobile number.
export function toIndianMobileE164(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  const national = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0')
      ? digits.slice(1)
      : digits
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null
}

/** "+919876543210" → "+91 98765 43210", for display. */
export function formatIndianMobile(e164: string): string {
  const match = e164.match(/^\+91(\d{5})(\d{5})$/)
  return match ? `+91 ${match[1]} ${match[2]}` : e164
}
