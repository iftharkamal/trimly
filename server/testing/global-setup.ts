// Vitest global setup for integration tests: creates the test database if
// needed and applies all migrations, once per run.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { getTestDatabaseUrl } from './test-database'

async function ensureDatabaseExists(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const databaseName = url.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Unexpected test database name "${databaseName}"`)
  }

  // Connect to the server's maintenance database to create ours.
  url.pathname = '/postgres'
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  try {
    const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [databaseName])
    if (!rowCount) {
      await client.query(`create database "${databaseName}"`)
    }
  }
  finally {
    await client.end()
  }
}

export default async function setup() {
  const databaseUrl = getTestDatabaseUrl()
  await ensureDatabaseExists(databaseUrl)

  const db = drizzle({ connection: databaseUrl })
  try {
    await migrate(db, { migrationsFolder: 'server/db/migrations' })
  }
  finally {
    await db.$client.end()
  }
}
