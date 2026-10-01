// Remembers the customer's codes per shop on this device (their queue place
// and their booking), so returning to the shop page can link back to them.
// Best effort: storage may be unavailable (private mode, blocked site data).

type PlaceKind = 'queue' | 'booking'

function storageKey(kind: PlaceKind, shopSlug: string) {
  return `trimly:${kind}:${shopSlug}`
}

function remember(kind: PlaceKind, shopSlug: string, code: string) {
  try {
    localStorage.setItem(storageKey(kind, shopSlug), code)
  }
  catch {
    // Not critical: the customer still has the page open.
  }
}

function recall(kind: PlaceKind, shopSlug: string): string | null {
  try {
    return localStorage.getItem(storageKey(kind, shopSlug))
  }
  catch {
    return null
  }
}

function forget(kind: PlaceKind, shopSlug: string) {
  try {
    localStorage.removeItem(storageKey(kind, shopSlug))
  }
  catch {
    // Nothing to clean up.
  }
}

export interface RememberedPlace {
  kind: PlaceKind
  shopSlug: string
  code: string
}

/** Every queue place and booking this device remembers, across shops. */
export function listRememberedPlaces(): RememberedPlace[] {
  try {
    const places: RememberedPlace[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      const match = key?.match(/^trimly:(queue|booking):(.+)$/)
      const code = key ? localStorage.getItem(key) : null
      if (match && code) {
        places.push({ kind: match[1] as PlaceKind, shopSlug: match[2]!, code })
      }
    }
    return places
  }
  catch {
    return []
  }
}

export function forgetPlace(place: RememberedPlace) {
  forget(place.kind, place.shopSlug)
}

export const rememberQueuePlace = (shopSlug: string, code: string) => remember('queue', shopSlug, code)
export const recallQueuePlace = (shopSlug: string) => recall('queue', shopSlug)
export const forgetQueuePlace = (shopSlug: string) => forget('queue', shopSlug)

export const rememberBooking = (shopSlug: string, code: string) => remember('booking', shopSlug, code)
export const recallBooking = (shopSlug: string) => recall('booking', shopSlug)
export const forgetBooking = (shopSlug: string) => forget('booking', shopSlug)
