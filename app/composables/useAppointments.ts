// Appointments starting on shop dates [from, to), plus the barber's actions.
import type { CreateAppointmentBody } from '#shared/schemas/appointment'
import type { AppointmentDto } from '#shared/types/appointment'
import type { ApiSuccess } from '#shared/types/queue'

export type AppointmentAction = 'check-in' | 'cancel' | 'no-show'

const ACTION_MESSAGES: Record<AppointmentAction, { success: string, failure: string }> = {
  'check-in': { success: 'Checked in: added to the queue', failure: 'Could not check in' },
  'cancel': { success: 'Appointment cancelled', failure: 'Could not cancel' },
  'no-show': { success: 'Marked as no-show', failure: 'Could not mark as no-show' }
}

export async function useAppointments(range: MaybeRefOrGetter<{ from: string, to: string }>) {
  const toast = useToast()
  // Forwards the session cookie during the server render.
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `appointments:${toValue(range).from}:${toValue(range).to}`,
    async () => (await requestFetch<ApiSuccess<AppointmentDto[]>>('/api/dashboard/appointments', { query: toValue(range) })).data
  )
  const { data, status, error, refresh } = asyncData

  /** The appointment an action is being sent for. */
  const pending = ref<{ id: string, action: AppointmentAction } | null>(null)
  const booking = ref(false)

  async function act(action: AppointmentAction, id: string): Promise<boolean> {
    pending.value = { id, action }
    try {
      await $fetch(`/api/dashboard/appointments/${id}/${action}`, { method: 'POST' })
      toast.add({ title: ACTION_MESSAGES[action].success, color: 'success', icon: 'i-lucide-check' })
      await refresh()
      return true
    }
    catch (caught) {
      toast.add({
        title: ACTION_MESSAGES[action].failure,
        description: getApiErrorMessage(caught),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      await refresh()
      return false
    }
    finally {
      pending.value = null
    }
  }

  async function book(body: CreateAppointmentBody): Promise<AppointmentDto | null> {
    booking.value = true
    try {
      const { data: created } = await $fetch<ApiSuccess<AppointmentDto>>('/api/dashboard/appointments', {
        method: 'POST',
        body
      })
      toast.add({ title: `Booked ${created.customer.name}`, color: 'success', icon: 'i-lucide-calendar-check' })
      await refresh()
      return created
    }
    catch (caught) {
      toast.add({
        title: 'Could not book',
        description: getApiErrorMessage(caught),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      return null
    }
    finally {
      booking.value = false
    }
  }

  await asyncData
  return {
    appointments: data,
    status,
    error,
    refresh,
    pending,
    booking,
    book,
    checkIn: (id: string) => act('check-in', id),
    cancel: (id: string) => act('cancel', id),
    noShow: (id: string) => act('no-show', id)
  }
}
