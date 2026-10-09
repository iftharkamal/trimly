/**
 * The address customers use to reach the app, for QR codes and shared links.
 * Set NUXT_PUBLIC_SITE_URL (the ngrok address while testing on phones, the
 * real domain in production); falls back to BETTER_AUTH_URL at build time,
 * then to the address this page was opened on.
 */
export function usePublicSiteUrl(): string {
  return useRuntimeConfig().public.siteUrl || useRequestURL().origin
}
