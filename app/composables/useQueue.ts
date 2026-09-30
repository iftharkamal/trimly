// The live queue for one shop, plus the barber's actions on it.
// Positions and ETAs always come from the server: every action responds with
// the recalculated queue, and the queue is re-fetched on an interval.
import { PAYMENT_METHOD_LABELS } from '#shared/constants'
import type { PaymentInput } from '#shared/schemas/payment'
import type { JoinQueueBody } from '#shared/schemas/queue'
import type { ApiSuccess, JoinQueueResultDto, OwnerShopQueueDto, ShopQueueDto } from '#shared/types/queue'

export type QueueAction = 'start' | 'complete' | 'cancel' | 'no-show'

const POLL_INTERVAL_MS = 10_000

const ACTION_MESSAGES: Record<QueueAction, { success: string, failure: string }> = {
  'start': { success: 'Service started', failure: 'Could not start the service' },
  'complete': { success: 'Service completed', failure: 'Could not complete the service' },
  'cancel': { success: 'Removed from the queue', failure: 'Could not cancel' },
  'no-show': { success: 'Marked as no-show', failure: 'Could not mark as no-show' }
}

/** Await it so the first render (including the server render) has the queue. */
export async function useQueue(
  shopId: MaybeRefOrGetter<string | undefined>,
  options: { onChange?: () => unknown } = {}
) {
  const toast = useToast()
  // Forwards the session cookie during the server render.
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `queue:${toValue(shopId) ?? ''}`,
    async () => {
      const id = toValue(shopId)
      if (!id) {
        return null
      }
      const response = await requestFetch<ApiSuccess<ShopQueueDto>>(`/api/shops/${id}/queue`)
      return response.data
    }
  )

  const { data, status, error, refresh } = asyncData

  // The dashboard is for the owner; anything else means the session no longer matches.
  const queue = computed(() => (data.value?.view === 'owner' ? data.value : null))

  /** The action currently being sent, so the UI can show a spinner and block double taps. */
  const pending = ref<{ entryId: string, action: QueueAction } | null>(null)
  const adding = ref(false)

  usePolling(() => {
    if (!pending.value && !adding.value) {
      refresh()
    }
  }, POLL_INTERVAL_MS)

  function showQueue(next: OwnerShopQueueDto) {
    data.value = next
    // A poll that started before the action would overwrite this with stale data.
    if (status.value === 'pending') {
      refresh()
    }
  }

  async function run(
    action: QueueAction,
    entryId: string,
    request: { body?: Record<string, unknown>, successDescription?: string } = {}
  ): Promise<boolean> {
    pending.value = { entryId, action }
    try {
      const response = await $fetch<ApiSuccess<OwnerShopQueueDto>>(`/api/queue/${entryId}/${action}`, {
        method: 'POST',
        body: request.body
      })
      showQueue(response.data)
      toast.add({
        title: ACTION_MESSAGES[action].success,
        description: request.successDescription,
        color: 'success',
        icon: 'i-lucide-check'
      })
      options.onChange?.()
      return true
    }
    catch (caught) {
      toast.add({
        title: ACTION_MESSAGES[action].failure,
        description: getApiErrorMessage(caught),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      // Someone else may have changed the queue; show what's actually there.
      await refresh()
      return false
    }
    finally {
      pending.value = null
    }
  }

  async function addCustomer(body: JoinQueueBody): Promise<boolean> {
    const id = toValue(shopId)
    if (!id) {
      return false
    }

    adding.value = true
    try {
      const { data: result } = await $fetch<ApiSuccess<JoinQueueResultDto>>(`/api/shops/${id}/queue`, {
        method: 'POST',
        body
      })
      await refresh()
      const { position, waitMinutes } = result.entry
      toast.add({
        title: `${body.name} added`,
        description: position === null ? undefined : `#${position} in line · ${formatWait(waitMinutes ?? 0)} wait`,
        color: 'success',
        icon: 'i-lucide-user-plus'
      })
      options.onChange?.()
      return true
    }
    catch (caught) {
      toast.add({
        title: 'Could not add customer',
        description: getApiErrorMessage(caught),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      return false
    }
    finally {
      adding.value = false
    }
  }

  // Awaited last: hooks and composables above must register before the first await.
  await asyncData

  return {
    queue,
    status,
    error,
    refresh,
    pending,
    adding,
    start: (entryId: string) => run('start', entryId),
    /** Completes the service; with `payment`, records it in the same request. */
    complete: (entryId: string, payment: PaymentInput | null = null, currency = '') =>
      run('complete', entryId, {
        body: { payment },
        successDescription: payment
          ? `${formatMoney(payment.amountMinor, currency)} paid by ${PAYMENT_METHOD_LABELS[payment.method]}`
          : 'No payment recorded'
      }),
    cancel: (entryId: string) => run('cancel', entryId),
    noShow: (entryId: string) => run('no-show', entryId),
    addCustomer
  }
}
