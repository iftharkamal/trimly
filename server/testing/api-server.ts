// Vitest global setup for API tests: builds the production server and runs it
// against the test database, so endpoints are exercised over real HTTP.
// Runs after global-setup.ts, which has already created and migrated the database.
import { execSync, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type AddressInfo } from 'node:net'
import type { TestProject } from 'vitest/node'
import { getTestDatabaseUrl } from './test-database'

declare module 'vitest' {
  export interface ProvidedContext {
    apiBaseUrl: string
    /** JSON-lines file the server writes every email to. */
    emailFile: string
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

async function waitUntilReady(baseUrl: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/`)
      return
    }
    catch {
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw new Error(`API server did not start within ${timeoutMs}ms`)
}

export default async function setup(project: TestProject) {
  const databaseUrl = getTestDatabaseUrl()

  try {
    // Separate build dir: doesn't disturb a running `pnpm dev`.
    execSync('pnpm nuxt build', { stdio: 'pipe', env: { ...process.env, NUXT_BUILD_DIR: '.nuxt-test' } })
  }
  catch (error) {
    const output = error as { stdout?: Buffer, stderr?: Buffer }
    throw new Error(`nuxt build failed:\n${output.stdout?.toString() ?? ''}${output.stderr?.toString() ?? ''}`)
  }

  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  // Emails (verification, password reset) go to a file the tests read.
  const emailFile = join(tmpdir(), `trimly-api-emails-${port}.jsonl`)
  writeFileSync(emailFile, '')
  const server = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      // Never the development database.
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: 'api-tests-only-secret-not-for-production-use',
      EMAIL_PROVIDER: 'file',
      // Tests act as different clients via X-Forwarded-For (as behind a real proxy).
      TRUST_PROXY: 'true',
      EMAIL_FILE_PATH: emailFile
    },
    stdio: ['ignore', 'inherit', 'inherit']
  })

  await waitUntilReady(baseUrl)
  project.provide('apiBaseUrl', baseUrl)
  project.provide('emailFile', emailFile)

  return () => {
    server.kill()
  }
}
