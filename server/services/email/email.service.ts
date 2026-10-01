// Sending email, behind one small interface. Today: "console" (prints the
// email, with its link, to the server log) and "file" (appends JSON lines,
// used by the API tests). A real provider (Resend, SMTP, …) is a new sender
// here plus an EMAIL_PROVIDER value; nothing else changes.
import { appendFile } from 'node:fs/promises'

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export interface EmailSender {
  name: string
  send(message: EmailMessage): Promise<void>
}

const consoleSender: EmailSender = {
  name: 'console',
  async send(message) {
    console.info(`\n── Email (not sent: EMAIL_PROVIDER=console) ──\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n──\n`)
  }
}

function fileSender(path: string): EmailSender {
  return {
    name: 'file',
    async send(message) {
      await appendFile(path, `${JSON.stringify({ ...message, sentAt: new Date().toISOString() })}\n`)
    }
  }
}

function configuredSender(): EmailSender {
  const provider = process.env.EMAIL_PROVIDER ?? 'console'
  switch (provider) {
    case 'console':
      return consoleSender
    case 'file': {
      const path = process.env.EMAIL_FILE_PATH
      if (!path) {
        throw new Error('EMAIL_PROVIDER=file needs EMAIL_FILE_PATH')
      }
      return fileSender(path)
    }
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${provider}"`)
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await configuredSender().send(message)
}

/**
 * Sends without making the caller wait, so response times don't reveal
 * whether an account exists. Failures are logged.
 */
export function sendEmailInBackground(message: EmailMessage): void {
  sendEmail(message).catch((error: unknown) => {
    console.error(`Could not send email "${message.subject}" to ${message.to}:`, error)
  })
}
