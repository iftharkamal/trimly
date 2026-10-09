// Staff: a shop's barbers (chairs in the queue) and the people working them.
// The person is a shop member (barbers.member_id → shop_members → user), so
// staff never get a separate login identity. The owner adds a barber by name
// and mobile; the chair is linked to that person's membership when the number
// belongs to a verified account, now or the next time they verify it.
import { and, asc, count, eq, gte, inArray, isNull } from 'drizzle-orm'
import type { MemberRole } from '../../shared/constants'
import type { CreateStaffBody, UpdateStaffBody } from '../../shared/schemas/staff'
import { useDb, type Transaction } from '../db'
import { isUniqueViolation } from '../db/errors'
import { appointments, barbers, queueEntries, shopMembers, user } from '../db/schema'
import { DomainError } from './errors'
import { addMember, lockMemberships } from './membership.service'

export type StaffAccountStatus = 'LINKED' | 'INVITED'
export type StaffWorkStatus = 'SERVING' | 'AVAILABLE' | 'INACTIVE'

export interface StaffMember {
  /** The barber (chair) id. */
  id: string
  name: string
  isActive: boolean
  /** Their role in the shop; null until their account is linked. */
  role: MemberRole | null
  account: {
    status: StaffAccountStatus
    /** The linked account's own name, email and phone (null until linked). */
    name: string | null
    email: string | null
    phoneNumber: string | null
  }
  /** The mobile number they were added with. */
  invitePhone: string | null
  status: StaffWorkStatus
  /** Customers waiting for this barber now. */
  waiting: number
}

const PLACEHOLDER_EMAIL_SUFFIX = '@phone.trimly.invalid'

/** Everyone on the shop's staff, active first, with what they're doing now. */
export async function listStaff(shopId: string): Promise<StaffMember[]> {
  const db = useDb()
  const [rows, load] = await Promise.all([
    db
      .select({
        id: barbers.id,
        name: barbers.name,
        isActive: barbers.isActive,
        invitePhone: barbers.invitePhone,
        memberId: barbers.memberId,
        role: shopMembers.role,
        accountName: user.name,
        accountEmail: user.email,
        accountPhone: user.phoneNumber
      })
      .from(barbers)
      .leftJoin(shopMembers, eq(shopMembers.id, barbers.memberId))
      .leftJoin(user, eq(user.id, shopMembers.userId))
      .where(eq(barbers.shopId, shopId))
      .orderBy(asc(barbers.createdAt)),
    db
      .select({ barberId: queueEntries.barberId, status: queueEntries.status, count: count() })
      .from(queueEntries)
      .where(and(eq(queueEntries.shopId, shopId), inArray(queueEntries.status, ['WAITING', 'IN_PROGRESS'])))
      .groupBy(queueEntries.barberId, queueEntries.status)
  ])

  const waiting = new Map<string, number>()
  const serving = new Set<string>()
  for (const row of load) {
    if (row.status === 'IN_PROGRESS') {
      serving.add(row.barberId)
    }
    else {
      waiting.set(row.barberId, row.count)
    }
  }

  return rows
    .map(row => ({
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      role: row.role,
      account: {
        status: row.memberId ? 'LINKED' as const : 'INVITED' as const,
        name: row.accountName,
        email: row.accountEmail && !row.accountEmail.endsWith(PLACEHOLDER_EMAIL_SUFFIX) ? row.accountEmail : null,
        phoneNumber: row.accountPhone
      },
      invitePhone: row.invitePhone,
      status: !row.isActive ? 'INACTIVE' as const : serving.has(row.id) ? 'SERVING' as const : 'AVAILABLE' as const,
      waiting: waiting.get(row.id) ?? 0
    }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
}

/** The verified account with this mobile number, if any. */
async function findVerifiedAccount(tx: Transaction, phoneNumber: string) {
  return tx.query.user.findFirst({
    where: and(eq(user.phoneNumber, phoneNumber), eq(user.phoneNumberVerified, true)),
    columns: { id: true }
  })
}

/**
 * The membership a chair in `shopId` should be linked to for this person,
 * creating a BARBER membership if they have none. Null if they can't be
 * linked: they already work a chair here, or they belong to another shop
 * (one shop per person until the app can switch between shops).
 */
async function membershipForChair(tx: Transaction, shopId: string, userId: string): Promise<{ id: string } | { conflict: 'ALREADY_STAFF' | 'MEMBER_OF_ANOTHER_SHOP' }> {
  const memberships = await lockMemberships(tx, userId)
  const here = memberships.find(membership => membership.shopId === shopId)
  if (here) {
    const chair = await tx.query.barbers.findFirst({ where: eq(barbers.memberId, here.id), columns: { id: true } })
    return chair ? { conflict: 'ALREADY_STAFF' } : { id: here.id }
  }
  if (memberships.length > 0) {
    return { conflict: 'MEMBER_OF_ANOTHER_SHOP' }
  }
  return { id: await addMember(tx, { shopId, userId, role: 'BARBER' }) }
}

const CONFLICT_MESSAGES = {
  ALREADY_STAFF: 'This person is already on your staff.',
  MEMBER_OF_ANOTHER_SHOP: 'This number belongs to someone who already works at another shop on Trimly.'
} as const

/**
 * Adds a barber: a chair with this name, usable in the queue at once. If the
 * mobile number belongs to a verified account, that person becomes a BARBER
 * member working it now; otherwise when they first verify the number.
 */
export async function addBarber(shopId: string, input: CreateStaffBody): Promise<string> {
  try {
    return await useDb().transaction(async (tx) => {
      const account = await findVerifiedAccount(tx, input.phone)
      let memberId: string | null = null
      if (account) {
        const membership = await membershipForChair(tx, shopId, account.id)
        if ('conflict' in membership) {
          throw new DomainError(membership.conflict, 409, CONFLICT_MESSAGES[membership.conflict])
        }
        memberId = membership.id
      }
      const [barber] = await tx
        .insert(barbers)
        .values({ shopId, name: input.name, invitePhone: input.phone, memberId })
        .returning({ id: barbers.id })
      if (!barber) {
        throw new Error('Failed to add barber')
      }
      return barber.id
    })
  }
  catch (error) {
    if (isUniqueViolation(error, 'barbers_shop_invite_phone_unique') || isUniqueViolation(error, 'barbers_member_id_unique')) {
      throw new DomainError('ALREADY_STAFF', 409, CONFLICT_MESSAGES.ALREADY_STAFF)
    }
    throw error
  }
}

/**
 * Renames, deactivates or reactivates a barber. Deactivating stops new
 * customers and removes a BARBER's dashboard access (the owner keeps theirs);
 * it's refused while customers are waiting, being served or booked with them,
 * and for the shop's last active barber. Reactivating links their account
 * again if their number is verified.
 */
export async function updateStaff(shopId: string, barberId: string, input: UpdateStaffBody): Promise<void> {
  await useDb().transaction(async (tx) => {
    const [barber] = await tx
      .select()
      .from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.shopId, shopId)))
      .for('update')
    if (!barber) {
      throw new DomainError('BARBER_NOT_FOUND', 404, 'Barber not found')
    }

    let memberId = barber.memberId
    if (input.isActive === false && barber.isActive) {
      const [queued] = await tx
        .select({ count: count() })
        .from(queueEntries)
        .where(and(eq(queueEntries.barberId, barberId), inArray(queueEntries.status, ['WAITING', 'IN_PROGRESS'])))
      const [booked] = await tx
        .select({ count: count() })
        .from(appointments)
        .where(and(eq(appointments.barberId, barberId), eq(appointments.status, 'BOOKED'), gte(appointments.startsAt, new Date())))
      if ((queued?.count ?? 0) > 0 || (booked?.count ?? 0) > 0) {
        throw new DomainError('BARBER_HAS_CUSTOMERS', 409, `${barber.name} still has customers waiting or booked. Finish, move or cancel them first.`)
      }
      // Lock the shop's chairs so two deactivations can't both leave nobody.
      const active = await tx
        .select({ id: barbers.id })
        .from(barbers)
        .where(and(eq(barbers.shopId, shopId), eq(barbers.isActive, true)))
        .for('update')
      if (active.length <= 1) {
        throw new DomainError('LAST_ACTIVE_BARBER', 409, 'A shop needs at least one active barber.')
      }
      if (barber.memberId) {
        const member = await tx.query.shopMembers.findFirst({ where: eq(shopMembers.id, barber.memberId), columns: { role: true } })
        if (member?.role === 'BARBER') {
          // Their dashboard access ends; the chair's member_id is cleared by the foreign key.
          await tx.delete(shopMembers).where(eq(shopMembers.id, barber.memberId))
          memberId = null
        }
      }
    }

    if (input.isActive === true && !barber.isActive && !barber.memberId && barber.invitePhone) {
      const account = await findVerifiedAccount(tx, barber.invitePhone)
      if (account) {
        const membership = await membershipForChair(tx, shopId, account.id)
        memberId = 'id' in membership ? membership.id : null
      }
    }

    await tx
      .update(barbers)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        memberId
      })
      .where(eq(barbers.id, barberId))
  })
}

/**
 * Someone just verified this mobile number (sign-up, sign-in or adding it):
 * link any active chair waiting for it. Called by Better Auth; never throws,
 * so it can't block a sign-in. With invitations from several shops, the
 * oldest wins (one shop per person for now).
 */
export async function claimStaffInvites(phoneNumber: string, userId: string): Promise<void> {
  try {
    const invites = await useDb()
      .select({ id: barbers.id, shopId: barbers.shopId })
      .from(barbers)
      .where(and(eq(barbers.invitePhone, phoneNumber), isNull(barbers.memberId), eq(barbers.isActive, true)))
      .orderBy(asc(barbers.createdAt))
    for (const invite of invites) {
      await useDb().transaction(async (tx) => {
        const membership = await membershipForChair(tx, invite.shopId, userId)
        if ('id' in membership) {
          await tx.update(barbers).set({ memberId: membership.id }).where(and(eq(barbers.id, invite.id), isNull(barbers.memberId)))
        }
      })
    }
  }
  catch (error) {
    console.error('Could not link staff invites for a verified number:', error)
  }
}
