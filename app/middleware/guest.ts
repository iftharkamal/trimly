// Pages for signed-out users only (login): signed-in users go to the dashboard.
export default defineNuxtRouteMiddleware(async () => {
  const { data: session } = await authClient.useSession(useFetch)
  if (session.value) {
    return navigateTo('/dashboard')
  }
})
