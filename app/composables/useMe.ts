import type { MeDto } from '#shared/types/account'
import type { ApiSuccess } from '#shared/types/queue'

/** The signed-in user and their shop (null until onboarding). Shared by the guards. */
export function useMe() {
  const requestFetch = useRequestFetch()
  return useAsyncData('me', async () => {
    try {
      return (await requestFetch<ApiSuccess<MeDto>>('/api/me')).data
    }
    catch {
      return null
    }
  })
}
