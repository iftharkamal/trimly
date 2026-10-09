// Phone numbers as a sign-in identity (Better Auth phoneNumber plugin).

/** E.164: "+" and 8–15 digits, no spaces. The only format stored, so one number can't appear twice. */
const E164 = /^\+[1-9]\d{7,14}$/

/** Country calling codes we send codes to (SMS_ALLOWED_COUNTRY_CODES, comma-separated; default India). */
export function allowedCountryCodes(env: Record<string, string | undefined> = process.env): string[] {
  return (env.SMS_ALLOWED_COUNTRY_CODES ?? '+91')
    .split(',')
    .map(code => code.trim())
    .filter(code => /^\+\d{1,4}$/.test(code))
}

/**
 * Whether we accept this number for sign-in: E.164, in an allowed country.
 * The allow-list stops "SMS pumping" (bots requesting codes to expensive
 * international numbers at our cost).
 */
export function isAllowedPhoneNumber(phoneNumber: string, countryCodes = allowedCountryCodes()): boolean {
  return E164.test(phoneNumber) && countryCodes.some(code => phoneNumber.startsWith(code))
}

// Better Auth requires an email on every user. Accounts created by phone get
// this internal address: the reserved .invalid domain never receives mail,
// we never send to it, and the API reports the email as missing.
const PLACEHOLDER_EMAIL_DOMAIN = 'phone.trimly.invalid'

export function placeholderEmailFor(phoneNumber: string): string {
  return `${phoneNumber.replace(/\D/g, '')}@${PLACEHOLDER_EMAIL_DOMAIN}`
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`)
}

/** The SMS text carrying a sign-in code. */
export function otpMessage(code: string, minutes: number): string {
  return `${code} is your Trimly code. It expires in ${minutes} minutes. Don't share it with anyone.`
}
