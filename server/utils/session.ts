import type { H3Event } from 'h3'
import { findShopIdByOwner } from '../services/shop.service'
import { ApiError } from './api'
import { useAuth } from './auth'

async function getSessionUser(event: H3Event): Promise<{ id: string, name: string } | null> {
  const session = await useAuth().api.getSession({ headers: event.headers })
  return session ? { id: session.user.id, name: session.user.name } : null
}

/** The signed-in user and the shop they own; 401/403 otherwise. */
export async function requireShopOwner(event: H3Event): Promise<{ userId: string, userName: string, shopId: string }> {
  const user = await getSessionUser(event)
  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 401, 'Sign in to continue')
  }

  const shopId = await findShopIdByOwner(user.id)
  if (!shopId) {
    throw new ApiError('FORBIDDEN', 403, 'This account does not manage a shop')
  }

  return { userId: user.id, userName: user.name, shopId }
}

/** Whether the request comes from the owner of `shopId` (false when signed out). */
export async function isShopOwner(event: H3Event, shopId: string): Promise<boolean> {
  const user = await getSessionUser(event)
  return user !== null && (await findShopIdByOwner(user.id)) === shopId
}
