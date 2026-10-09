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
  /** Minutes between one customer finishing and the next starting, used in ETAs. */
  serviceBufferMinutes: number
}
