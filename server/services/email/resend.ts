// Resend (https://resend.com) over its HTTP API: one request per email,
// using the built-in fetch, so no SDK dependency.
import type { EmailSender } from './email.service'

const RESEND_API_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export function createResendSender(
  { apiKey, from, fetch = globalThis.fetch }: { apiKey: string, from: string, fetch?: typeof globalThis.fetch }
): EmailSender {
  return {
    name: 'resend',
    async send(message) {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (!response.ok) {
        // Resend explains the problem (bad key, unverified domain, …) in `message`.
        const body = await response.json().catch(() => null) as { message?: string } | null
        throw new Error(`Resend refused the email (HTTP ${response.status}): ${body?.message ?? response.statusText}`)
      }
    }
  }
}
