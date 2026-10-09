// Reading the sign-in codes the API server "texted" (SMS_PROVIDER=file) in API tests.
import { readFileSync } from 'node:fs'
import { inject } from 'vitest'

interface SentSms {
  to: string
  text: string
  sentAt: string
}

function readMessages(): SentSms[] {
  return readFileSync(inject('smsFile'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as SentSms)
}

export function countCodes(to: string): number {
  return readMessages().filter(message => message.to === to).length
}

/** The newest code texted to `to` after the first `skip` messages (waits briefly: sending is async). */
export async function waitForCode(to: string, skip = 0): Promise<string> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const messages = readMessages().filter(message => message.to === to)
    const code = messages.length > skip ? messages.at(-1)!.text.match(/\b(\d{6})\b/)?.[1] : undefined
    if (code) {
      return code
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`No code texted to ${to}`)
}
