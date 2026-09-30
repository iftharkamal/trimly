import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

function createDb() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  return drizzle({ connection: connectionString, schema })
}

export type Database = ReturnType<typeof createDb>

let instance: Database | undefined

// Created on first use rather than at import time, so a missing DATABASE_URL
// fails the request that needs the database instead of the whole server.
export function useDb(): Database {
  instance ??= createDb()
  return instance
}
