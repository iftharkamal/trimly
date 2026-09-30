// The anonymized live queue a customer sees, and joining it.
import type { JoinQueueBody } from '#shared/schemas/queue'
import type { ApiSuccess, JoinQueueResultDto, PublicShopQueueDto, ShopQueueDto } from '#shared/types/queue'

const POLL_INTERVAL_MS = 15_000

/** The parts of a queue view the customer pages use. */
export type CustomerQueueView = Pick<PublicShopQueueDto, 'shopId' | 'calculatedAt' | 'barbers' | 'soonestBarberId'>

export type JoinResult =
  | { ok: true, result: JoinQueueResultDto }
  | { ok: false, code: string, message: string }

export async function usePublicQueue(shopId: MaybeRefOrGetter<string | undefined>) {
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `public-queue:${toValue(shopId) ?? ''}`,
    async (): Promise<ShopQueueDto | null> => {
      const id = toValue(shopId)
      return id ? (await requestFetch<ApiSuccess<ShopQueueDto>>(`/api/shops/${id}/queue`)).data : null
    }
  )
  const { data, status, error, refresh } = asyncData

  // Customers get the public view; the shop owner browsing their own page gets
  // the owner view, which contains every field the customer page reads.
  const queue = computed<CustomerQueueView | null>(() => data.value ?? null)

  const joining = ref(false)

  usePolling(() => {
    if (!joining.value) {
      refresh()
    }
  }, POLL_INTERVAL_MS)

  async function join(body: JoinQueueBody): Promise<JoinResult> {
    const id = toValue(shopId)
    if (!id) {
      return { ok: false, code: 'SHOP_NOT_FOUND', message: 'Shop not found' }
    }

    joining.value = true
    try {
      const { data: result } = await $fetch<ApiSuccess<JoinQueueResultDto>>(`/api/shops/${id}/queue`, {
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
      joining.value = false
    }
  }

  await asyncData
  return { queue, status, error, refresh, joining, join }
}
