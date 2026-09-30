import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['server/**/*.test.ts'],
          exclude: ['server/**/*.integration.test.ts']
        }
      },
      {
        // Needs PostgreSQL and TEST_DATABASE_URL (a database ending in _test).
        test: {
          name: 'integration',
          include: ['server/**/*.integration.test.ts'],
          globalSetup: ['server/testing/global-setup.ts'],
          setupFiles: ['server/testing/integration-setup.ts'],
          // Files share one database, so run them one at a time.
          fileParallelism: false
        }
      }
    ]
  }
})
