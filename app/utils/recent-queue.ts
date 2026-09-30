// Remembers the customer's tracking code per shop on this device, so returning
// to the shop page can link back to their place. Best effort: storage may be
// unavailable (private mode, blocked site data).

function storageKey(shopSlug: string) {
  return `trimly:queue:${shopSlug}`
}

export function rememberQueuePlace(shopSlug: string, trackingCode: string) {
  try {
    localStorage.setItem(storageKey(shopSlug), trackingCode)
  }
  catch {
    // Not critical: the customer still has the status page open.
  }
}

export function recallQueuePlace(shopSlug: string): string | null {
  try {
    return localStorage.getItem(storageKey(shopSlug))
  }
  catch {
    return null
  }
}

export function forgetQueuePlace(shopSlug: string) {
  try {
    localStorage.removeItem(storageKey(shopSlug))
  }
  catch {
    // Nothing to clean up.
  }
}
