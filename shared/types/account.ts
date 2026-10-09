import type { MemberRole } from '../constants'
import type { ShopProfileDto } from './shop'

/** The signed-in user, their shop and their role in it (null until onboarding is done). */
export interface MeDto {
  user: {
    id: string
    name: string
    /** Null for accounts created with a phone number. */
    email: string | null
    /** Verified, E.164; null until added. */
    phoneNumber: string | null
  }
  shop: ShopProfileDto | null
  role: MemberRole | null
}

export interface SlugAvailabilityDto {
  /** The normalized link name that was checked. */
  slug: string
  available: boolean
}
