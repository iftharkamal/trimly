import { describe, expect, it } from 'vitest'
import { DEV_SMS_ALLOWED } from './dev-sms'
import { configuredSmsSender, isSmsAvailable } from './sms.service'

// `devAllowed` is fixed at build time in the app (dev-sms.ts); here it's passed in.
const DEV = true
const PRODUCTION_BUILD = false

describe('configuredSmsSender', () => {
  it('is never allowed outside Nitro (no build constants), like a production build', () => {
    expect(DEV_SMS_ALLOWED).toBe(false)
  })

  it('defaults to the console sender in development', () => {
    expect(configuredSmsSender({}, DEV)?.name).toBe('console')
  })

  it('has no sender in a production build unless a real provider is configured', () => {
    expect(configuredSmsSender({}, PRODUCTION_BUILD)).toBeNull()
    expect(isSmsAvailable({}, PRODUCTION_BUILD)).toBe(false)
    // Whatever NODE_ENV says at runtime.
    expect(configuredSmsSender({ NODE_ENV: 'development' }, PRODUCTION_BUILD)).toBeNull()
  })

  it('never uses a development sender in a production build', () => {
    expect(() => configuredSmsSender({ SMS_PROVIDER: 'console' }, PRODUCTION_BUILD)).toThrow(/development only/)
    expect(() => configuredSmsSender({ SMS_PROVIDER: 'file', SMS_FILE_PATH: 'x' }, PRODUCTION_BUILD)).toThrow(/development only/)
    expect(isSmsAvailable({ SMS_PROVIDER: 'console' }, PRODUCTION_BUILD)).toBe(false)
  })

  it('needs a path for the file sender and rejects unknown providers', () => {
    expect(() => configuredSmsSender({ SMS_PROVIDER: 'file' }, DEV)).toThrow(/SMS_FILE_PATH/)
    expect(configuredSmsSender({ SMS_PROVIDER: 'file', SMS_FILE_PATH: '/tmp/sms' }, DEV)?.name).toBe('file')
    expect(() => configuredSmsSender({ SMS_PROVIDER: 'carrier-pigeon' }, DEV)).toThrow(/Unknown/)
  })
})
