// Response shapes for the barber dashboard and the service catalog.
import type { MemberRole } from '../constants'
import type { ShopProfileDto } from './shop'

export interface DashboardDto {
  shop: ShopProfileDto
  /** The signed-in member. */
  member: {
    name: string
    role: MemberRole
    /** The chair they work, if any: their lane in the queue. */
    barberId: string | null
  }
  /** Who owns the shop (the signed-in member, unless they're staff). */
  owner: {
    name: string
  } | null
  /** Barbers who can take customers (for booking and walk-ins). */
  barbers: { id: string, name: string }[]
  today: {
    /** Joined today and not cancelled or marked no-show. */
    customers: number
    servicesCompleted: number
    /** Payments received today, in minor units. */
    revenueMinor: number
  }
}

export interface ServiceDto {
  id: string
  name: string
  durationMinutes: number
  priceMinor: number
}

/** A service as the owner manages it (archived ones included). */
export interface ManagedServiceDto extends ServiceDto {
  shopId: string
  /** Archived services (false) are hidden from customers; past visits keep them. */
  isActive: boolean
  createdAt: string
  updatedAt: string
}
