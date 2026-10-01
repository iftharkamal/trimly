import { describe, expect, it } from 'vitest'
import { isAllowedRequestOrigin, originMatches } from './request-origin'

describe('originMatches', () => {
  it('matches exact origins, ignoring case', () => {
    expect(originMatches('https://trimly.example.com', 'https://trimly.example.com')).toBe(true)
    expect(originMatches('https://Trimly.Example.com', 'https://trimly.example.com')).toBe(true)
    expect(originMatches('https://trimly.example.com:8443', 'https://trimly.example.com')).toBe(false)
    expect(originMatches('http://trimly.example.com', 'https://trimly.example.com')).toBe(false)
  })

  it('matches wildcard subdomains only', () => {
    expect(originMatches('https://abc-123.ngrok-free.app', 'https://*.ngrok-free.app')).toBe(true)
    expect(originMatches('https://ngrok-free.app', 'https://*.ngrok-free.app')).toBe(false)
    expect(originMatches('https://evil.com', 'https://*.ngrok-free.app')).toBe(false)
    expect(originMatches('https://evil.com:1.ngrok-free.app', 'https://*.ngrok-free.app')).toBe(false)
    expect(originMatches('http://abc.ngrok-free.app', 'https://*.ngrok-free.app')).toBe(false)
  })
})

describe('isAllowedRequestOrigin', () => {
  const options = { host: 'trimly.example.com', allowedOrigins: ['https://trimly.example.com', 'https://*.ngrok-free.app'] }

  it('allows requests without an Origin (not a browser)', () => {
    expect(isAllowedRequestOrigin(undefined, options)).toBe(true)
    expect(isAllowedRequestOrigin(null, options)).toBe(true)
  })

  it('allows the same host, the app URL and trusted origins', () => {
    expect(isAllowedRequestOrigin('https://trimly.example.com', options)).toBe(true)
    // Behind a TLS-terminating proxy the server sees http, the browser https: same host.
    expect(isAllowedRequestOrigin('https://localhost:3000', { host: 'localhost:3000', allowedOrigins: [] })).toBe(true)
    expect(isAllowedRequestOrigin('https://abc.ngrok-free.app', { host: 'localhost:3000', allowedOrigins: options.allowedOrigins })).toBe(true)
  })

  it('refuses other sites, "null" and malformed origins', () => {
    expect(isAllowedRequestOrigin('https://evil.example.net', options)).toBe(false)
    expect(isAllowedRequestOrigin('https://trimly.example.com.evil.net', options)).toBe(false)
    expect(isAllowedRequestOrigin('null', options)).toBe(false)
    expect(isAllowedRequestOrigin('not a url', options)).toBe(false)
    expect(isAllowedRequestOrigin('https://evil.example.net', { host: undefined, allowedOrigins: [] })).toBe(false)
  })
})
