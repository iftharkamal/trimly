// A customer's booking by its private link code, and cancelling it.
import type { BookingDto } from '#shared/types/booking'
import type { ApiSuccess } from '#shared/types/queue'

export async function useBooking(trackingCode: MaybeRefOrGetter<string>) {
  const toast = useToast()
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `booking:${toValue(trackingCode)}`,
    async () => (await requestFetch<ApiSuccess<BookingDto>>(`/api/bookings/${toValue(trackingCode)}`)).data
  )
  const { data, status, error, refresh } = asyncData
  const cancelling = ref(false)

  // Picks up a check-in by the barber without a reload.
  usePolling(() => {
    if (!cancelling.value) {
      refresh()
    }
  }, 30_000)

  async function cancel(): Promise<boolean> {
    cancelling.value = true
    try {
      const response = await $fetch<ApiSuccess<BookingDto>>(`/api/bookings/${toValue(trackingCode)}/cancel`, { method: 'POST' })
      data.value = response.data
      toast.add({ title: 'Appointment cancelled', color: 'neutral', icon: 'i-lucide-calendar-x' })
      return true
    }
    catch (caught) {
      toast.add({ title: 'Could not cancel', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
      await refresh()
      return false
    }
    finally {
      cancelling.value = false
    }
  }

  await asyncData
  return { booking: data, status, error, refresh, cancelling, cancel }
}
