import { createAuthClient } from 'better-auth/vue'

// Talks to /api/auth on the same origin.
export const authClient = createAuthClient()
