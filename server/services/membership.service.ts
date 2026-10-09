// Who belongs to which shop, and as what (shop_members). The user id always
// comes from the server-side session, never from a request.
import { and, eq } from 'drizzle-orm'
import type { MemberRole } from '../../shared/constants'
import { useDb, type Transaction } from '../db'
import { shopMembers } from '../db/schema'

export interface Membership {
  shopId: string
  role: MemberRole
}

/** The user's shop and role (MVP: a person belongs to at most one shop), or null. */
export async function findMembership(userId: string): Promise<Membership | null> {
  const member = await useDb().query.shopMembers.findFirst({
    where: eq(shopMembers.userId, userId),
    columns: { shopId: true, role: true }
  })
  return member ?? null
}

/** The user's role in one particular shop, or null if they don't belong to it. */
export async function findMembershipInShop(userId: string, shopId: string): Promise<Membership | null> {
  const member = await useDb().query.shopMembers.findFirst({
    where: and(eq(shopMembers.userId, userId), eq(shopMembers.shopId, shopId)),
    columns: { shopId: true, role: true }
  })
  return member ?? null
}

export async function addMember(tx: Transaction, input: { shopId: string, userId: string, role: MemberRole }): Promise<void> {
  await tx.insert(shopMembers).values(input)
}
