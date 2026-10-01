// Onboarding: only for signed-in users who don't have a shop yet.
export default defineNuxtRouteMiddleware(async (to) => {
  const { data: me, error } = await useMe()
  if (error.value) {
    return redirectForMeError(error.value, to)
  }
  if (me.value?.shop) {
    return navigateTo('/dashboard')
  }
})
