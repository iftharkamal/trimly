// Pages that need a signed-in user. Checked on the server render too.
export default defineNuxtRouteMiddleware(async (to) => {
  const { data: session } = await authClient.useSession(useFetch)
  if (!session.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }
})
