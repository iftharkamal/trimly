// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@pinia/nuxt'],

  // Components are grouped in folders by feature but named by file
  // (components/queue/QueueItem.vue → <QueueItem>).
  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      title: 'Trimly'
    }
  },

  css: ['~/assets/css/main.css'],

  // Light until the user picks otherwise (remembered per device).
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },

  typescript: {
    strict: true
  }
})
