// https://nuxt.com/docs/api/configuration/nuxt-config

// The API tests' build (TRIMLY_TEST_BUILD=true, see server/testing/api-server.ts):
// the development SMS sender is allowed in it, so it goes to its own output
// directory and can't be mistaken for a deployable build.
const isTestBuild = process.env.TRIMLY_TEST_BUILD === 'true'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // The API tests build into their own directory so they can run while `pnpm dev` is running.
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',

  modules: ['@nuxt/ui'],

  // Components are grouped in folders by feature but named by file
  // (components/queue/QueueItem.vue → <QueueItem>).
  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      title: 'Trimly',
      meta: [
        // Full-bleed on notched phones; pages pad with env(safe-area-inset-*).
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        // Browser bar matches the page canvas.
        { name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#09090b', media: '(prefers-color-scheme: dark)' }
      ]
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
    // Fixed at build time, so no runtime environment variable can turn it on (server/services/sms/dev-sms.ts).
    replace: {
      'process.env.TRIMLY_TEST_BUILD': JSON.stringify(isTestBuild ? 'true' : '')
    },
    ...(isTestBuild ? { output: { dir: '.output-test' } } : {}),
    experimental: {
      tasks: true
    },
    // "Getting close" also happens as time passes, not only when the queue changes.
    scheduledTasks: {
      '* * * * *': ['notifications:proximity'],
      '0 * * * *': ['maintenance:prune-request-limits']
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
