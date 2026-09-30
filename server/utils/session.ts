import type { H3Event } from 'h3'
import { findShopIdByOwner } from '../services/shop.service'
import { ApiError } from './api'
import { useAuth } from './auth'

async function getSessionUserId(event: H3Event): Promise<string | null> {
  const session = await useAuth().api.getSession({ headers: event.headers })
  return session?.user.id ?? null
}

/** The signed-in user and the shop they own; 401/403 otherwise. */
export async function requireShopOwner(event: H3Event): Promise<{ userId: string, shopId: string }> {
  const userId = await getSessionUserId(event)
  if (!userId) {
    throw new ApiError('UNAUTHENTICATED', 401, 'Sign in to continue')
  }

  const shopId = await findShopIdByOwner(userId)
  if (!shopId) {
    throw new ApiError('FORBIDDEN', 403, 'This account does not manage a shop')
  }

  return { userId, shopId }
}

/** Whether the request comes from the owner of `shopId` (false when signed out). */
export async function isShopOwner(event: H3Event, shopId: string): Promise<boolean> {
  const userId = await getSessionUserId(event)
  return userId !== null && (await findShopIdByOwner(userId)) === shopId
}
