// Who belongs to which shop, and as what (shop_members). The user id always
// comes from the server-side session, never from a request.
import { and, asc, eq, sql } from 'drizzle-orm'
import type { MemberRole } from '../../shared/constants'
import { useDb, type Transaction } from '../db'
import { shopMembers, user } from '../db/schema'

export interface Membership {
  id: string
  shopId: string
  role: MemberRole
}

const COLUMNS = { id: true, shopId: true, role: true } as const

/** Every shop the user belongs to, oldest membership first. */
export async function listMemberships(userId: string): Promise<Membership[]> {
  return useDb().query.shopMembers.findMany({
    where: eq(shopMembers.userId, userId),
    columns: COLUMNS,
    orderBy: [asc(shopMembers.createdAt), asc(shopMembers.id)]
  })
}

/** The user's membership in one particular shop, or null if they don't belong to it. */
export async function findMembershipInShop(userId: string, shopId: string): Promise<Membership | null> {
  const member = await useDb().query.shopMembers.findFirst({
    where: and(eq(shopMembers.userId, userId), eq(shopMembers.shopId, shopId)),
    columns: COLUMNS
  })
  return member ?? null
}

/** Adds a member inside the caller's transaction; returns the membership id. */
export async function addMember(tx: Transaction, input: { shopId: string, userId: string, role: MemberRole }): Promise<string> {
  const [member] = await tx.insert(shopMembers).values(input).returning({ id: shopMembers.id })
  if (!member) {
    throw new Error('Failed to add member')
  }
  return member.id
}

/**
 * Within a transaction: waits for any other transaction working on this
 * user's memberships, then says whether they already belong to a shop. Two
 * requests at once (a double-click) can't both see "no".
 */
/**
 * Within a transaction: waits for any other transaction changing this user's
 * memberships (creating a shop, joining one as staff), then returns them.
 */
export async function lockMemberships(tx: Transaction, userId: string): Promise<Membership[]> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`shop_members:${userId}`}, 0))`)
  return tx.query.shopMembers.findMany({ where: eq(shopMembers.userId, userId), columns: COLUMNS })
}

export async function lockAndCheckHasMembership(tx: Transaction, userId: string): Promise<boolean> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`shop_members:${userId}`}, 0))`)
  const existing = await tx.query.shopMembers.findFirst({ where: eq(shopMembers.userId, userId), columns: { id: true } })
  return existing !== undefined
}

/** The shop's OWNER (one per shop), or null. */
export async function findShopOwner(shopId: string): Promise<{ userId: string, name: string } | null> {
  const [owner] = await useDb()
    .select({ userId: user.id, name: user.name })
    .from(shopMembers)
    .innerJoin(user, eq(user.id, shopMembers.userId))
    .where(and(eq(shopMembers.shopId, shopId), eq(shopMembers.role, 'OWNER')))
    .limit(1)
  return owner ?? null
}
