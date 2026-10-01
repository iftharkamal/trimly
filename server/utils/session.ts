// Who is making the request, from the Better Auth session cookie only.
// Routes never accept a user, shop or role from the client.
import type { H3Event } from 'h3'
import { findShopIdByOwner } from '../services/shop.service'
import { ApiError } from './api'
import { useAuth } from './auth'

export interface SessionUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await useAuth().api.getSession({ headers: event.headers })
  if (!session) {
    return null
  }
  const { id, name, email, emailVerified } = session.user
  return { id, name, email, emailVerified }
}

/** The signed-in, verified user; 401/403 otherwise. */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event)
  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 401, 'Sign in to continue')
  }
  // Sign-in already requires a verified email; this guards any older session.
  if (!user.emailVerified) {
    throw new ApiError('EMAIL_NOT_VERIFIED', 403, 'Verify your email to continue')
  }
  return user
}

/** The signed-in user and the shop they own; 401/403 otherwise. */
export async function requireShopOwner(event: H3Event): Promise<{ userId: string, userName: string, shopId: string }> {
  const user = await requireUser(event)

  const shopId = await findShopIdByOwner(user.id)
  if (!shopId) {
    throw new ApiError('FORBIDDEN', 403, 'This account does not manage a shop')
  }

  return { userId: user.id, userName: user.name, shopId }
}

/** Whether the request comes from the owner of `shopId` (false when signed out). */
export async function isShopOwner(event: H3Event, shopId: string): Promise<boolean> {
  const user = await getSessionUser(event)
  return user !== null && user.emailVerified && (await findShopIdByOwner(user.id)) === shopId
}
