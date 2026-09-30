import type { ApiSuccess } from '#shared/types/queue'
import type { ShopProfileDto } from '#shared/types/shop'

/** A shop's public profile by its URL name. Await it so the first render has it. */
export async function useShop(slug: MaybeRefOrGetter<string>) {
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    () => `shop:${toValue(slug)}`,
    async () => (await requestFetch<ApiSuccess<ShopProfileDto>>(`/api/shops/by-slug/${toValue(slug)}`)).data
  )

  await asyncData
  const { data, status, error, refresh } = asyncData
  return { shop: data, status, error, refresh }
}
