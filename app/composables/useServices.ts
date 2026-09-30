import type { ServiceDto } from '#shared/types/dashboard'
import type { ApiSuccess } from '#shared/types/queue'

/** A shop's active services, cheapest first. */
export async function useServices(shopId: MaybeRefOrGetter<string | undefined>) {
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `services:${toValue(shopId) ?? ''}`,
    async (): Promise<ServiceDto[]> => {
      const id = toValue(shopId)
      return id ? (await requestFetch<ApiSuccess<ServiceDto[]>>(`/api/shops/${id}/services`)).data : []
    }
  )

  await asyncData
  const { data, status, error, refresh } = asyncData
  return { services: data, status, error, refresh }
}
