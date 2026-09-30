export interface ShopProfileDto {
  id: string
  name: string
  slug: string
  /** IANA timezone; format times in it so every device shows shop time. */
  timezone: string
  currency: string
  /** Taking online customers. */
  isOpen: boolean
}
