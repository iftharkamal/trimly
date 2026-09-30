// Shared plumbing for API routes: one response envelope, one error format,
// and Zod validation of params and bodies.
import type { H3Event } from 'h3'
import type { z } from 'zod'
import type { ApiErrorBody, ApiSuccess } from '../../shared/types/queue'
import { DomainError } from '../services/errors'

/** A request-level failure (validation, auth) raised by the API layer itself. */
export class ApiError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: ApiErrorBody['error']['details']

  constructor(code: string, statusCode: number, message: string, details?: ApiErrorBody['error']['details']) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

function toErrorResponse(error: unknown): { statusCode: number, body: ApiErrorBody } {
  if (error instanceof ApiError || error instanceof DomainError) {
    const details = error instanceof ApiError ? error.details : undefined
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message, ...(details ? { details } : {}) } }
    }
  }

  // h3's own client errors, e.g. a request body that isn't valid JSON.
  if (isError(error) && error.statusCode < 500) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: 'BAD_REQUEST', message: error.statusMessage || 'Bad request' } }
    }
  }

  console.error(error)
  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }
  }
}

/**
 * Wraps a route so success responses are `{ data }` and every failure is
 * `{ error: { code, message, details? } }` with a matching HTTP status.
 */
export function defineApiHandler<T>(handler: (event: H3Event) => Promise<T>) {
  return defineEventHandler(async (event): Promise<ApiSuccess<T>> => {
    try {
      return { data: await handler(event) }
    }
    catch (error) {
      const { statusCode, body } = toErrorResponse(error)
      setResponseStatus(event, statusCode)
      // Non-2xx responses carry ApiErrorBody; $fetch throws on them, so callers
      // only ever receive ApiSuccess<T> as a return value.
      return body as never
    }
  })
}

function validate<S extends z.ZodType>(schema: S, input: unknown, part: string): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ApiError(
      'VALIDATION_ERROR',
      400,
      `Invalid request ${part}`,
      result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
    )
  }
  return result.data
}

export function parseParams<S extends z.ZodType>(event: H3Event, schema: S): z.output<S> {
  return validate(schema, getRouterParams(event), 'parameters')
}

export function parseQuery<S extends z.ZodType>(event: H3Event, schema: S): z.output<S> {
  return validate(schema, getQuery(event), 'query')
}

export async function parseBody<S extends z.ZodType>(event: H3Event, schema: S): Promise<z.output<S>> {
  return validate(schema, await readBody(event), 'body')
}
