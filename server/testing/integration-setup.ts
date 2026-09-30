// Runs in each integration test worker before the test files: points the app's
// database client at the test database and closes it when the file is done.
import { afterAll } from 'vitest'
import { useDb } from '../db'
import { getTestDatabaseUrl } from './test-database'

process.env.DATABASE_URL = getTestDatabaseUrl()

afterAll(async () => {
  await useDb().$client.end()
})
