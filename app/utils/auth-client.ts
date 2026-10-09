import { createAuthClient } from 'better-auth/vue'
import { phoneNumberClient } from 'better-auth/client/plugins'

// Talks to /api/auth on the same origin. The session lives in an httpOnly
// cookie set by the server; nothing about it is kept in browser storage.
export const authClient = createAuthClient({
  plugins: [phoneNumberClient()]
})
