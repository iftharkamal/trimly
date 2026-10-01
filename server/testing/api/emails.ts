// Reading what the API server "sent" (EMAIL_PROVIDER=file) in API tests.
import { readFileSync } from 'node:fs'
import { inject } from 'vitest'

interface SentEmail {
  to: string
  subject: string
  text: string
  sentAt: string
}

function readEmails(): SentEmail[] {
  return readFileSync(inject('emailFile'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as SentEmail)
}

/** The newest email to `to` whose subject contains `subject` (waits briefly: sending is async). */
export async function waitForEmail(to: string, subject: string, newerThan = 0): Promise<SentEmail> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const match = readEmails()
      .filter(email => email.to === to && email.subject.includes(subject) && Date.parse(email.sentAt) > newerThan)
      .at(-1)
    if (match) {
      return match
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`No "${subject}" email to ${to}`)
}

/** The first link in an email. */
export function linkIn(email: SentEmail): string {
  const link = email.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) {
    throw new Error(`No link in "${email.subject}"`)
  }
  return link
}

export function countEmails(to: string, subject: string): number {
  return readEmails().filter(email => email.to === to && email.subject.includes(subject)).length
}
