// Dashboard pages: the signed-in user must have finished onboarding.
// Runs after `auth`, so there is a session.
export default defineNuxtRouteMiddleware(async () => {
  const { data: me } = await useMe()
  if (me.value && !me.value.shop) {
    return navigateTo('/onboarding')
  }
})
