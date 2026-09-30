import type { OpeningHours } from '#shared/schemas/hours'
import type { ApiSuccess } from '#shared/types/queue'

/** The shop's weekly opening hours, and saving them. */
export async function useOpeningHours() {
  const toast = useToast()
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    'opening-hours',
    async () => (await requestFetch<ApiSuccess<OpeningHours>>('/api/dashboard/hours')).data
  )
  const { data, status, error, refresh } = asyncData
  const saving = ref(false)

  async function save(hours: OpeningHours): Promise<boolean> {
    saving.value = true
    try {
      const response = await $fetch<ApiSuccess<OpeningHours>>('/api/dashboard/hours', { method: 'PUT', body: hours })
      data.value = response.data
      toast.add({ title: 'Opening hours saved', color: 'success', icon: 'i-lucide-check' })
      return true
    }
    catch (caught) {
      toast.add({ title: 'Could not save', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
    finally {
      saving.value = false
    }
  }

  await asyncData
  return { hours: data, status, error, refresh, saving, save }
}
