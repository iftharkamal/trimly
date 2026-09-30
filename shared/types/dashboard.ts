// Response shapes for the barber dashboard and the service catalog.
import type { ShopProfileDto } from './shop'

export interface DashboardDto {
  shop: ShopProfileDto
  owner: {
    name: string
  }
  today: {
    /** Joined today and not cancelled or marked no-show. */
    customers: number
    servicesCompleted: number
    /** Prices of services completed today (stands in for revenue until payments exist). */
    completedRevenueMinor: number
  }
}

export interface ServiceDto {
  id: string
  name: string
  durationMinutes: number
  priceMinor: number
}
