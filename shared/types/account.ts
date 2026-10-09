import type { MemberRole } from '../constants'
import type { ShopProfileDto } from './shop'

/** The signed-in user, their current shop and role (null until onboarding is done), and every shop they belong to. */
export interface MeDto {
  user: {
    id: string
    name: string
    /** Null for accounts created with a phone number. */
    email: string | null
    /** Verified, E.164; null until added. */
    phoneNumber: string | null
  }
  /** The current shop: the only one they belong to. Null with none, or with several (choosing isn't available yet). */
  shop: ShopProfileDto | null
  role: MemberRole | null
  memberships: { shop: ShopProfileDto, role: MemberRole }[]
}

export interface SlugAvailabilityDto {
  /** The normalized link name that was checked. */
  slug: string
  available: boolean
}
