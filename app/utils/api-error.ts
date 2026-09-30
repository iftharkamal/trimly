import type { ApiErrorBody } from '#shared/types/queue'

/** The server's error message from a failed $fetch, or a generic fallback. */
export function getApiErrorMessage(error: unknown): string {
  const body = (error as { data?: Partial<ApiErrorBody> } | null)?.data
  return body?.error?.message ?? 'Something went wrong. Please try again.'
}
