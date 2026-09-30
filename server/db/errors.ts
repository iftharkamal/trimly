interface PgError {
  code: string
  constraint?: string
}

// Drizzle wraps driver errors, so walk the `cause` chain to find the pg error.
function findPgError(error: unknown): PgError | undefined {
  let current: unknown = error
  while (current && typeof current === 'object') {
    if ('code' in current && typeof current.code === 'string') {
      return current as PgError
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = findPgError(error)
  return pgError?.code === '23505' && pgError.constraint === constraint
}

export function isExclusionViolation(error: unknown, constraint: string): boolean {
  const pgError = findPgError(error)
  return pgError?.code === '23P01' && pgError.constraint === constraint
}
