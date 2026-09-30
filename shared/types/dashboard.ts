// Response shapes for the barber dashboard and the service catalog.
import type { ShopProfileDto } from './shop'

export interface DashboardDto {
  shop: ShopProfileDto
  owner: {
    name: string
  }
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
