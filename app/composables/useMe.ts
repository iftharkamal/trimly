import type { RouteLocationNormalized } from 'vue-router'
import type { NuxtError } from '#app'
import type { MeDto } from '#shared/types/account'
import type { ApiSuccess } from '#shared/types/queue'

/** The signed-in user and their shop (null until onboarding). Shared by the guards. */
export function useMe() {
  const requestFetch = useRequestFetch()
  return useAsyncData('me', async () => (await requestFetch<ApiSuccess<MeDto>>('/api/me')).data)
}

/**
 * For route guards when /api/me failed: signed out (401) → sign in again;
 * anything else (server down, network) → the error page, rather than letting
 * the page load half-broken.
 */
export function redirectForMeError(error: NuxtError, to: RouteLocationNormalized) {
  if (error.statusCode === 401) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
  const status = error.statusCode ?? 500
  return abortNavigation(createError({
    statusCode: status >= 400 ? status : 500,
    statusMessage: 'We couldn\'t load your account',
    fatal: true
  }))
}
