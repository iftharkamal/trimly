// Who is signed in, for the UI. It comes from the server (GET /api/me reads the
// Better Auth session cookie); nothing is stored in the browser. It only
// decides what to show and where to send people: every API checks the session
// and role itself.
import type { MeDto } from '#shared/types/account'
import type { ApiSuccess } from '#shared/types/queue'

const KEY = 'me'

/** Fetches the signed-in user from the server. Used by the `auth` / `guest` middleware. */
export function loadCurrentUser() {
  const requestFetch = useRequestFetch()
  return useAsyncData(KEY, async () => (await requestFetch<ApiSuccess<MeDto>>('/api/me')).data)
}

/** The signed-in user as last loaded by the middleware, and sign-out. */
export function useCurrentUser() {
  const { data: me } = useNuxtData<MeDto>(KEY)
  const user = computed(() => me.value?.user ?? null)
  const signingOut = ref(false)

  async function signOut() {
    signingOut.value = true
    await authClient.signOut()
    clearNuxtData()
    await navigateTo('/auth/login')
  }

  return {
    me,
    user,
    shop: computed(() => me.value?.shop ?? null),
    role: computed(() => me.value?.role ?? null),
    /** Email, or the mobile number for accounts created by phone. */
    contact: computed(() => user.value?.email ?? (user.value?.phoneNumber ? formatIndianMobile(user.value.phoneNumber) : '')),
    refresh: () => refreshNuxtData(KEY),
    signOut,
    signingOut
  }
}
