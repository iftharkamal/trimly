// A customer's own place in the queue, by tracking code. Refreshes on an
// interval; everything shown (position, ETA, state) comes from the server.
import type { ApiSuccess, QueueTrackingDto } from '#shared/types/queue'

const POLL_INTERVAL_MS = 15_000

export async function useQueueTracking(trackingCode: MaybeRefOrGetter<string>) {
  const toast = useToast()
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `tracking:${toValue(trackingCode)}`,
    async () => (await requestFetch<ApiSuccess<QueueTrackingDto>>(`/api/track/${toValue(trackingCode)}`)).data
  )
  const { data, status, error, refresh } = asyncData

  const leaving = ref(false)

  usePolling(() => {
    if (!leaving.value) {
      refresh()
    }
  }, POLL_INTERVAL_MS)

  async function leave(): Promise<boolean> {
    leaving.value = true
    try {
      const response = await $fetch<ApiSuccess<QueueTrackingDto>>(`/api/track/${toValue(trackingCode)}/cancel`, {
        method: 'POST'
      })
      data.value = response.data
      toast.add({ title: 'You left the queue', color: 'neutral', icon: 'i-lucide-log-out' })
      return true
    }
    catch (caught) {
      toast.add({
        title: 'Could not leave the queue',
        description: getApiErrorMessage(caught),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      await refresh()
      return false
    }
    finally {
      leaving.value = false
    }
  }

  await asyncData
  return { tracking: data, status, error, refresh, leaving, leave }
}
