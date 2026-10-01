// Dashboard pages: the signed-in user must have finished onboarding.
// Runs after `auth`, so there is a session.
export default defineNuxtRouteMiddleware(async (to) => {
  const { data: me, error } = await useMe()
  if (error.value) {
    return redirectForMeError(error.value, to)
  }
  if (me.value && !me.value.shop) {
    return navigateTo('/onboarding')
  }
})
