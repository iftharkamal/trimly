// HTTP helpers shared by the API test files (real requests to the built server).
import { expect, inject } from 'vitest'
import { linkIn, waitForEmail } from './emails'

export const baseUrl = inject('apiBaseUrl')

let clientNumber = 0

/**
 * A different client address per call (the test server trusts X-Forwarded-For),
 * so per-client rate limits don't throttle the test suite as one client.
 */
export function newClientIp(): string {
  clientNumber++
  return `10.${(clientNumber >> 16) & 255}.${(clientNumber >> 8) & 255}.${clientNumber & 255}`
}

export interface ApiResponse {
  status: number
  headers: Headers
  // Arbitrary JSON; each test asserts the parts it cares about.
  json: any
}

export async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  // origin: what a browser would send; defaults to the app itself, null sends none (not a browser).
  options: { body?: unknown, rawBody?: string, cookie?: string, ip?: string, origin?: string | null } = {}
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? newClientIp() }
  const origin = options.origin === undefined ? baseUrl : options.origin
  if (origin !== null) {
    headers.origin = origin
  }
  if (options.cookie) {
    headers.cookie = options.cookie
  }
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers['content-type'] = 'application/json'
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  })
  const text = await response.text()
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null }
}

export function cookieFrom(response: Response): string {
  return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
}

export const TEST_PASSWORD = 'correct-horse-battery'

/** Signs up and verifies the email through the emailed link, which signs the user in. */
export async function signUp(email: string, name = 'Test User'): Promise<{ userId: string, cookie: string }> {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': baseUrl, 'x-forwarded-for': newClientIp() },
    body: JSON.stringify({ name, email, password: TEST_PASSWORD, callbackURL: '/' })
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { user: { id: string } }
  // No session until the email is verified.
  expect(cookieFrom(response)).not.toContain('session_token')

  const verified = await fetch(linkIn(await waitForEmail(email, 'Verify your email')), {
    redirect: 'manual',
    headers: { 'x-forwarded-for': newClientIp() }
  })
  const cookie = cookieFrom(verified)
  expect(cookie).toContain('session_token')
  return { userId: body.user.id, cookie }
}

/** Email/password sign-in; returns the response so tests can check refusals too. */
export function signIn(email: string, password = TEST_PASSWORD, ip = newClientIp()) {
  return fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': baseUrl, 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password })
  })
}

export function expectError(response: ApiResponse, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(response.json).toEqual({ error: expect.objectContaining({ code, message: expect.any(String) }) })
}
