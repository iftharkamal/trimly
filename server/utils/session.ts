// Who is making the request, from the Better Auth session cookie only, and
// what they may do: authenticated user → shop membership → shop. Routes never
// accept a user, shop or role from the client; a shop id in the URL is only
// used after checking the user belongs to that shop.
//
//   getCurrentUser(event)               the signed-in user, or null
//   requireUser(event)                  … or 401 / 403
//   requireShopMember(event, shopId?)   … and their membership, or 403 (409 if ambiguous)
//   requireRole(event, roles, shopId?)  … with one of these roles, or 403
//   getCurrentShopContext(event, shopId?) { user, membership, shop }
//   getShopMember(event, shopId)        membership in this shop, or null (public routes)
import type { H3Event } from 'h3'
import type { MemberRole } from '../../shared/constants'
import { findMembershipInShop, listMemberships, type Membership } from '../services/membership.service'
import { getShopProfile, type ShopProfile } from '../services/shop.service'
import { ApiError } from './api'
import { useAuth } from './auth'
import { isPlaceholderEmail } from './phone-identity'

export interface CurrentUser {
  id: string
  name: string
  /** Null for accounts created by phone (they have an internal placeholder). */
  email: string | null
  emailVerified: boolean
  phoneNumber: string | null
  phoneNumberVerified: boolean
}

export interface ShopMember {
  user: CurrentUser
  membershipId: string
  shopId: string
  role: MemberRole
}

// One session lookup per request, however many checks ask.
const currentUsers = new WeakMap<H3Event, Promise<CurrentUser | null>>()

async function loadCurrentUser(event: H3Event): Promise<CurrentUser | null> {
  const session = await useAuth().api.getSession({ headers: event.headers })
  if (!session) {
    return null
  }
  const { id, name, email, emailVerified, phoneNumber, phoneNumberVerified } = session.user
  return {
    id,
    name,
    email: isPlaceholderEmail(email) ? null : email,
    emailVerified,
    phoneNumber: phoneNumber ?? null,
    phoneNumberVerified: phoneNumberVerified ?? false
  }
}

/** The signed-in user, or null. */
export function getCurrentUser(event: H3Event): Promise<CurrentUser | null> {
  let user = currentUsers.get(event)
  if (!user) {
    user = loadCurrentUser(event)
    currentUsers.set(event, user)
  }
  return user
}

/** A user has proven an identity: a verified email or a verified phone number. */
function isVerified(user: CurrentUser) {
  return user.emailVerified || user.phoneNumberVerified
}

/** The signed-in, verified user. 401 without a session; 403 if unverified. */
export async function requireUser(event: H3Event): Promise<CurrentUser> {
  const user = await getCurrentUser(event)
  if (!user) {
    throw new ApiError('UNAUTHENTICATED', 401, 'Sign in to continue')
  }
  // Both sign-in methods already require verification; this guards any other session.
  if (!isVerified(user)) {
    throw new ApiError('ACCOUNT_NOT_VERIFIED', 403, 'Verify your email or phone number to continue')
  }
  return user
}

/**
 * Which of the user's memberships a request without a shop id is about: the
 * only one. Several would need the person to choose, which the app can't ask
 * yet, so it refuses rather than guess (409 SHOP_SELECTION_REQUIRED).
 */
export function resolveCurrentMembership(memberships: Membership[]): Membership | null {
  if (memberships.length > 1) {
    throw new ApiError('SHOP_SELECTION_REQUIRED', 409, 'This account belongs to more than one shop. Choosing between shops isn\'t available yet.')
  }
  return memberships[0] ?? null
}

/**
 * The signed-in user and their membership. With `shopId` (from the URL) they
 * must belong to that shop; without it, the shop is resolved from their
 * memberships. 403 FORBIDDEN if they don't belong.
 */
export async function requireShopMember(event: H3Event, shopId?: string): Promise<ShopMember> {
  const user = await requireUser(event)
  const membership = shopId
    ? await findMembershipInShop(user.id, shopId)
    : resolveCurrentMembership(await listMemberships(user.id))
  if (!membership) {
    throw new ApiError('FORBIDDEN', 403, shopId ? 'This account does not belong to this shop' : 'This account does not belong to a shop')
  }
  return { user, membershipId: membership.id, shopId: membership.shopId, role: membership.role }
}

/** Like requireShopMember, and the member must have one of `roles`. 403 INSUFFICIENT_ROLE otherwise. */
export async function requireRole(event: H3Event, roles: readonly MemberRole[], shopId?: string): Promise<ShopMember> {
  const member = await requireShopMember(event, shopId)
  if (!roles.includes(member.role)) {
    throw new ApiError('INSUFFICIENT_ROLE', 403, 'Your role in this shop can\'t do this')
  }
  return member
}

export interface ShopContext {
  user: CurrentUser
  membership: { id: string, role: MemberRole }
  shop: ShopProfile
}

/**
 * Everything a dashboard request is about: the signed-in user → their
 * membership → the shop. Requires authentication (401) and a membership
 * (403; 409 if the shop would have to be guessed). With `shopId` (from the
 * URL) the user must belong to that shop.
 */
export async function getCurrentShopContext(event: H3Event, shopId?: string): Promise<ShopContext> {
  const member = await requireShopMember(event, shopId)
  return {
    user: member.user,
    membership: { id: member.membershipId, role: member.role },
    shop: await getShopProfile(member.shopId)
  }
}

/** The requester's membership in this shop, or null (signed out, unverified, or not a member). Never throws. */
export async function getShopMember(event: H3Event, shopId: string): Promise<ShopMember | null> {
  const user = await getCurrentUser(event)
  if (!user || !isVerified(user)) {
    return null
  }
  const membership = await findMembershipInShop(user.id, shopId)
  return membership ? { user, membershipId: membership.id, shopId: membership.shopId, role: membership.role } : null
}
