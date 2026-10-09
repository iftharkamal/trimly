export interface ShopProfileDto {
  id: string
  name: string
  slug: string
  /** Contact number, E.164. */
  phone: string | null
  address: string | null
  /** IANA timezone; format times in it so every device shows shop time. */
  timezone: string
  currency: string
  /** Taking online customers. */
  isOpen: boolean
}
