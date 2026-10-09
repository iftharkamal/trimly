// Pages only a shop OWNER uses (services, reports). Runs after `auth` and
// `shop`. Only steers the UI: the server checks the role on every request.
export default defineNuxtRouteMiddleware(async () => {
  const { data: me } = await useMe()
  if (me.value && me.value.role !== 'OWNER') {
    return navigateTo('/dashboard')
  }
})
