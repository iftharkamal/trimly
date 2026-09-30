// Bookable times for a service (and optionally one barber), plus booking one.
import type { OnlineBookingBody } from '#shared/schemas/booking'
import type { AvailabilityDto, OnlineBookingResultDto } from '#shared/types/booking'
import type { ApiSuccess } from '#shared/types/queue'

export type BookingOutcome =
  | { ok: true, result: OnlineBookingResultDto }
  | { ok: false, code: string, message: string }

export function useAvailability(
  shopId: MaybeRefOrGetter<string | undefined>,
  serviceId: MaybeRefOrGetter<string | undefined>,
  barberId: MaybeRefOrGetter<string | null>
) {
  const { data, status, error, refresh } = useAsyncData(
    () => `availability:${toValue(shopId) ?? ''}:${toValue(serviceId) ?? ''}:${toValue(barberId) ?? 'any'}`,
    async (): Promise<AvailabilityDto | null> => {
      const shop = toValue(shopId)
      const service = toValue(serviceId)
      if (!shop || !service) {
        return null
      }
      const barber = toValue(barberId)
      const response = await $fetch<ApiSuccess<AvailabilityDto>>(`/api/shops/${shop}/availability`, {
        query: { serviceId: service, ...(barber ? { barberId: barber } : {}) }
      })
      return response.data
    },
    // Slots depend on the moment they're viewed; fetch in the browser.
    { server: false }
  )

  const booking = ref(false)

  async function book(body: OnlineBookingBody): Promise<BookingOutcome> {
    const shop = toValue(shopId)
    if (!shop) {
      return { ok: false, code: 'SHOP_NOT_FOUND', message: 'Shop not found' }
    }
    booking.value = true
    try {
      const { data: result } = await $fetch<ApiSuccess<OnlineBookingResultDto>>(`/api/shops/${shop}/appointments`, {
        method: 'POST',
        body
      })
      return { ok: true, result }
    }
    catch (caught) {
      const code = (caught as { data?: { error?: { code?: string } } }).data?.error?.code ?? 'UNKNOWN'
      return { ok: false, code, message: getApiErrorMessage(caught) }
    }
    finally {
      booking.value = false
    }
  }

  return { availability: data, status, error, refresh, booking, book }
}
