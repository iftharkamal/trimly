// Sending text messages (sign-in codes), behind one small interface, like
// email. SMS_PROVIDER picks the sender. No real provider is wired up yet, so a
// production build has none and phone sign-in is unavailable there. Under
// `nuxt dev` the default is the console sender in dev-sms.ts.
import { createDevSmsSender, DEV_SMS_ALLOWED, DEV_SMS_PROVIDERS } from './dev-sms'

export interface SmsMessage {
  /** E.164 */
  to: string
  text: string
}

export interface SmsSender {
  name: string
  send(message: SmsMessage): Promise<void>
}

type Env = Record<string, string | undefined>

/**
 * The configured sender, or null when none is (phone sign-in is then
 * unavailable). Development senders only where `devAllowed` (see dev-sms.ts).
 */
export function configuredSmsSender(env: Env = process.env, devAllowed = DEV_SMS_ALLOWED): SmsSender | null {
  const provider = env.SMS_PROVIDER || (devAllowed ? 'console' : '')
  if (!provider) {
    return null
  }
  if (DEV_SMS_PROVIDERS.has(provider)) {
    if (!devAllowed) {
      throw new Error(`SMS_PROVIDER=${provider} is for development only and is never used in a production build`)
    }
    return createDevSmsSender(provider, env)
  }
  throw new Error(`Unknown SMS_PROVIDER "${provider}"`)
}

/** Whether codes can be sent at all (a misconfigured provider counts as not). */
export function isSmsAvailable(env: Env = process.env, devAllowed = DEV_SMS_ALLOWED): boolean {
  try {
    return configuredSmsSender(env, devAllowed) !== null
  }
  catch {
    return false
  }
}

/** Sends without making the caller wait. Failures are logged. */
export function sendSmsInBackground(message: SmsMessage): void {
  Promise.resolve()
    .then(() => {
      const sender = configuredSmsSender()
      if (!sender) {
        throw new Error('No SMS provider is configured')
      }
      return sender.send(message)
    })
    .catch((error: unknown) => {
      console.error(`Could not send SMS to ${message.to}:`, error)
    })
}
