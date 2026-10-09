// Sign-in and sign-up pages: people who are already signed in go to the dashboard.
export default defineNuxtRouteMiddleware(async () => {
  const { data: me } = await loadCurrentUser()
  if (me.value) {
    return navigateTo('/dashboard')
  }
})
