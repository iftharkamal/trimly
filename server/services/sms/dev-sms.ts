// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPMENT AND TESTS ONLY. These "send" a text by printing it to the server
// log (console) or appending it to a file the API tests read (file). Anyone who
// can see the log could sign in as anyone, so they only run where
// DEV_SMS_ALLOWED is true, and the production startup check refuses to start
// with them configured. Codes are random per request (Better Auth); nothing
// here fixes or predicts a code.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFile } from 'node:fs/promises'
import type { SmsSender } from './sms.service'

export const DEV_SMS_PROVIDERS = new Set(['console', 'file'])

/**
 * Whether the development senders may run: under `nuxt dev`, or in the API
 * test build (built with TRIMLY_TEST_BUILD=true into .output-test). Both are
 * fixed when the app is built (Nitro replaces these expressions with
 * constants), so no environment variable can switch them on in a production
 * build. Outside Nitro (unit tests) this is false.
 */
export const DEV_SMS_ALLOWED: boolean = import.meta.dev === true || process.env.TRIMLY_TEST_BUILD === 'true'

export function createDevSmsSender(provider: string, env: Record<string, string | undefined>): SmsSender {
  if (provider === 'file') {
    const path = env.SMS_FILE_PATH
    if (!path) {
      throw new Error('SMS_PROVIDER=file needs SMS_FILE_PATH')
    }
    return {
      name: 'file',
      async send(message) {
        await appendFile(path, `${JSON.stringify({ ...message, sentAt: new Date().toISOString() })}\n`)
      }
    }
  }
  return {
    name: 'console',
    async send(message) {
      console.info(`\n── SMS (DEVELOPMENT ONLY, not sent) ──\nTo: ${message.to}\n${message.text}\n──\n`)
    }
  }
}
