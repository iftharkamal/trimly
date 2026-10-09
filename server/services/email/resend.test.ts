import { describe, expect, it, vi } from 'vitest'
import { createResendSender } from './resend'

const message = { to: 'barber@example.com', subject: 'Verify your email for Trimly', text: 'Hi,\nhttps://trimly.example.com/verify' }

describe('createResendSender', () => {
  it('posts the email to the Resend API with the key and sender', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }))
    const sender = createResendSender({ apiKey: 're_test_key', from: 'Trimly <no-reply@trimly.example.com>', fetch })

    await sender.send(message)

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'authorization': 'Bearer re_test_key', 'content-type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Trimly <no-reply@trimly.example.com>',
      to: ['barber@example.com'],
      subject: message.subject,
      text: message.text
    })
  })

  it('fails with Resend\'s explanation, without the API key', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ statusCode: 403, message: 'The trimly.example.com domain is not verified.' }), { status: 403 }))
    const sender = createResendSender({ apiKey: 're_secret_key', from: 'no-reply@trimly.example.com', fetch })

    const error = await sender.send(message).catch((caught: unknown) => caught as Error)

    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toBe('Resend refused the email (HTTP 403): The trimly.example.com domain is not verified.')
    expect(error!.message).not.toContain('re_secret_key')
  })

  it('copes with an error response that is not JSON', async () => {
    const fetch = vi.fn(async () => new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }))
    const sender = createResendSender({ apiKey: 'k', from: 'no-reply@trimly.example.com', fetch })

    await expect(sender.send(message)).rejects.toThrow('Resend refused the email (HTTP 502): Bad Gateway')
  })
})
