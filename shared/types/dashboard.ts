// Response shapes for the barber dashboard and the service catalog.

export interface DashboardDto {
  shop: {
    id: string
    name: string
    slug: string
    /** IANA timezone; format times in it so every device shows shop time. */
    timezone: string
    currency: string
  }
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
