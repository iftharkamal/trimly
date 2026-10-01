// Pure helpers for creating a shop, used by the onboarding form and the API.

/** A link name from a shop name: "Faisal's Barber Shop" → "faisals-barber-shop". */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** Whether the runtime knows this IANA timezone (e.g. "Asia/Kolkata"). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  }
  catch {
    return false
  }
}

/** Whether this is a real ISO 4217 currency code (e.g. "INR"). */
export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && Intl.supportedValuesOf('currency').includes(code)
}
