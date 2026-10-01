import { describe, expect, it } from 'vitest'
import { seedRefusal } from './seed-guard'

const LOCAL = 'postgres://postgres:postgres@localhost:5432/trimly'
const REMOTE = 'postgres://app:secret@db.example.com:5432/trimly'

describe('seedRefusal', () => {
  it('allows a local development database', () => {
    expect(seedRefusal({ DATABASE_URL: LOCAL })).toBeNull()
    expect(seedRefusal({ DATABASE_URL: 'postgres://u:p@127.0.0.1/trimly', NODE_ENV: 'development' })).toBeNull()
  })

  it('refuses in production, even against a local database', () => {
    expect(seedRefusal({ DATABASE_URL: LOCAL, NODE_ENV: 'production' })).toMatch(/production/)
  })

  it('refuses a missing or malformed DATABASE_URL', () => {
    expect(seedRefusal({})).toMatch(/DATABASE_URL/)
    expect(seedRefusal({ DATABASE_URL: 'not a url' })).toMatch(/DATABASE_URL/)
  })

  it('refuses a remote database unless explicitly allowed with a real password', () => {
    expect(seedRefusal({ DATABASE_URL: REMOTE })).toMatch(/not local/)
    expect(seedRefusal({ DATABASE_URL: REMOTE, SEED_ALLOW_REMOTE_DB: 'true' })).toMatch(/SEED_OWNER_PASSWORD/)
    expect(seedRefusal({ DATABASE_URL: REMOTE, SEED_ALLOW_REMOTE_DB: 'true', SEED_OWNER_PASSWORD: 'short' })).toMatch(/SEED_OWNER_PASSWORD/)
    expect(seedRefusal({ DATABASE_URL: REMOTE, SEED_ALLOW_REMOTE_DB: 'true', SEED_OWNER_PASSWORD: 'a-long-enough-password' })).toBeNull()
  })
})
