import { existsSync } from 'node:fs'

/**
 * The database integration tests run against. Integration tests truncate every
 * table, so this refuses anything whose database name doesn't end in `_test`.
 */
export function getTestDatabaseUrl(): string {
  // Doesn't override variables already set in the environment (e.g. in CI).
  if (existsSync('.env')) {
    process.loadEnvFile('.env')
  }

  const raw = process.env.TEST_DATABASE_URL
  if (!raw) {
    throw new Error('TEST_DATABASE_URL is not set. Add it to .env (see .env.example).')
  }

  const databaseName = new URL(raw).pathname.slice(1)
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against "${databaseName}": the database name must end in "_test".`)
  }

  return raw
}
