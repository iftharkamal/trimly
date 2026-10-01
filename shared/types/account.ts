import type { ShopProfileDto } from './shop'

/** The signed-in user and their shop (null until onboarding is done). */
export interface MeDto {
  user: {
    id: string
    name: string
    email: string
  }
  shop: ShopProfileDto | null
}

export interface SlugAvailabilityDto {
  /** The normalized link name that was checked. */
  slug: string
  available: boolean
}
