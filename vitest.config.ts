import { defineConfig } from 'vitest/config'

// The integration and api projects share the _test database: run them
// separately (pnpm test:integration, pnpm test:api), not in one invocation.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['server/**/*.test.ts'],
          exclude: ['server/**/*.integration.test.ts', 'server/**/*.api.test.ts']
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
      },
      {
        // Builds the app and calls the endpoints over HTTP; same database requirements.
        test: {
          name: 'api',
          include: ['server/**/*.api.test.ts'],
          globalSetup: ['server/testing/global-setup.ts', 'server/testing/api-server.ts'],
          setupFiles: ['server/testing/integration-setup.ts'],
          fileParallelism: false
        }
      }
    ]
  }
})
