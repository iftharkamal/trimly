// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // The API tests build into their own directory so they can run while `pnpm dev` is running.
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',

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
  },

  nitro: {
    experimental: {
      tasks: true
    },
    // "Getting close" also happens as time passes, not only when the queue changes.
    scheduledTasks: {
      '* * * * *': ['notifications:proximity']
    }
  },

  vite: {
    server: {
      // Let `pnpm tunnel` (ngrok) reach the dev server for testing on a phone.
      // Dev server only; production builds don't use this.
      allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app']
    }
  }
})
