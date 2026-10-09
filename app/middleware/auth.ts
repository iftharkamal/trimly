// Pages for signed-in people. Asks the server who is signed in (once per
// navigation, also on the server render), then applies what the page needs:
//
//   definePageMeta({ middleware: 'auth', shop: 'required' })   dashboard pages
//   definePageMeta({ middleware: 'auth', shop: 'none' })       onboarding
//   definePageMeta({ middleware: 'auth', role: 'OWNER' })      owner-only pages
//
// This only steers people to the right page; the server enforces every rule.
import type { MemberRole } from '#shared/constants'

declare module '#app' {
  interface PageMeta {
    /** required: must have finished onboarding; none: must not have a shop yet. */
    shop?: 'required' | 'none'
    role?: MemberRole
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const { data: me, error } = await loadCurrentUser()

  if (error.value && error.value.statusCode !== 401) {
    // Server down, network: the error page, not a half-working dashboard.
    return abortNavigation(createError({
      statusCode: (error.value.statusCode ?? 500) >= 400 ? error.value.statusCode : 500,
      statusMessage: 'We couldn\'t load your account',
      fatal: true
    }))
  }
  if (!me.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (to.meta.shop === 'required' && !me.value.shop && me.value.memberships.length > 1) {
    return abortNavigation(createError({
      statusCode: 409,
      statusMessage: 'This account belongs to more than one shop. Choosing between shops isn\'t available yet.',
      fatal: true
    }))
  }
  if (to.meta.shop === 'required' && !me.value.shop) {
    return navigateTo('/onboarding/shop')
  }
  if (to.meta.shop === 'none' && me.value.shop) {
    return navigateTo('/dashboard')
  }
  if (to.meta.role && me.value.role !== to.meta.role) {
    return navigateTo('/dashboard')
  }
})
