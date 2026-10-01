// Onboarding: only for signed-in users who don't have a shop yet.
export default defineNuxtRouteMiddleware(async () => {
  const { data: me } = await useMe()
  if (me.value?.shop) {
    return navigateTo('/dashboard')
  }
})
