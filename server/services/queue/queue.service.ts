// Queue use cases: loads rows, delegates all ordering/ETA math to the pure
// functions in queue-state.ts, and maps database constraints to domain errors.
// ETAs are never stored; every read (and every mutation's result) recalculates them.
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import type { QueueEntrySource, QueueEntryStatus } from '../../../shared/constants'
import { useDb, type Transaction } from '../../db'
import { isUniqueViolation } from '../../db/errors'
import {
  barbers,
  customers,
  ONE_ACTIVE_PER_CUSTOMER_SHOP,
  ONE_IN_PROGRESS_PER_BARBER,
  queueEntries,
  services,
  shops
} from '../../db/schema'
import { DomainError } from '../errors'
import { calculateQueueState, pickEarliestAvailableLane, type QueueState } from './queue-state'
import { statusesThatCanTransitionTo } from './transitions'

const ACTIVE_STATUSES: QueueEntryStatus[] = ['WAITING', 'IN_PROGRESS']
const MINUTE_MS = 60_000

export interface ActiveQueueEntry {
  id: string
  status: QueueEntryStatus
  source: QueueEntrySource
  joinedAt: Date
  startedAt: Date | null
  serviceName: string
  durationMinutes: number
  priceMinor: number
  customer: {
    id: string
    name: string
    phone: string | null
  }
}

export interface BarberQueue {
  barber: {
    id: string
    name: string
    isActive: boolean
  }
  state: QueueState<ActiveQueueEntry>
}

export interface ShopQueue {
  shopId: string
  calculatedAt: Date
  barbers: BarberQueue[]
}

/** A single entry as its customer sees it. Estimates are null once the entry is finished. */
export interface QueueEntryView {
  id: string
  shopId: string
  barberId: string
  status: QueueEntryStatus
  serviceName: string
  durationMinutes: number
  joinedAt: Date
  startedAt: Date | null
  endedAt: Date | null
  position: number | null
  customersAhead: number | null
  estimatedStart: Date | null
  estimatedEnd: Date | null
  waitMinutes: number | null
  calculatedAt: Date
}

export interface AddCustomerInput {
  shopId: string
  customer: {
    name: string
    /** Normalized (E.164). Null for a walk-in who didn't give one. */
    phone: string | null
  }
  serviceId: string
  /** Omit for "any barber": assigned to whoever can start soonest. */
  barberId?: string | null
  source: QueueEntrySource
}

export interface AddedQueueEntry {
  trackingCode: string
  entry: QueueEntryView
}

async function loadShopQueue(shopId: string, now: Date, barberId?: string): Promise<ShopQueue> {
  const db = useDb()

  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
    columns: { serviceBufferMinutes: true }
  })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }

  // Only a service that ended within the buffer window can delay the next start.
  const bufferCutoff = new Date(now.getTime() - shop.serviceBufferMinutes * MINUTE_MS)

  const [shopBarbers, entryRows, recentEnds] = await Promise.all([
    db
      .select({ id: barbers.id, name: barbers.name, isActive: barbers.isActive })
      .from(barbers)
      .where(and(eq(barbers.shopId, shopId), barberId ? eq(barbers.id, barberId) : undefined))
      .orderBy(asc(barbers.createdAt)),

    db
      .select({
        id: queueEntries.id,
        barberId: queueEntries.barberId,
        status: queueEntries.status,
        source: queueEntries.source,
        joinedAt: queueEntries.joinedAt,
        startedAt: queueEntries.startedAt,
        serviceName: queueEntries.serviceName,
        durationMinutes: queueEntries.durationMinutes,
        priceMinor: queueEntries.priceMinor,
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone
      })
      .from(queueEntries)
      .innerJoin(customers, eq(customers.id, queueEntries.customerId))
      .where(and(
        eq(queueEntries.shopId, shopId),
        inArray(queueEntries.status, ACTIVE_STATUSES),
        barberId ? eq(queueEntries.barberId, barberId) : undefined
      )),

    db
      .selectDistinctOn([queueEntries.barberId], { barberId: queueEntries.barberId, endedAt: queueEntries.endedAt })
      .from(queueEntries)
      .where(and(
        eq(queueEntries.shopId, shopId),
        isNotNull(queueEntries.startedAt),
        gte(queueEntries.endedAt, bufferCutoff),
        barberId ? eq(queueEntries.barberId, barberId) : undefined
      ))
      .orderBy(queueEntries.barberId, desc(queueEntries.endedAt))
  ])

  const entriesByBarber = new Map<string, ActiveQueueEntry[]>()
  for (const { barberId: entryBarberId, customerId, customerName, customerPhone, ...entry } of entryRows) {
    const lane = entriesByBarber.get(entryBarberId) ?? []
    lane.push({ ...entry, customer: { id: customerId, name: customerName, phone: customerPhone } })
    entriesByBarber.set(entryBarberId, lane)
  }

  const lastEndByBarber = new Map(recentEnds.map(row => [row.barberId, row.endedAt]))

  return {
    shopId,
    calculatedAt: now,
    barbers: shopBarbers
      // A deactivated barber still shows while customers remain in their queue.
      .filter(barber => barber.isActive || entriesByBarber.has(barber.id))
      .map(barber => ({
        barber,
        state: calculateQueueState(entriesByBarber.get(barber.id) ?? [], {
          now,
          bufferMinutes: shop.serviceBufferMinutes,
          lastServiceEndedAt: lastEndByBarber.get(barber.id) ?? null
        })
      }))
  }
}

/** Every barber's live queue with positions and ETAs, calculated now. */
export function getActiveQueue(shopId: string, now = new Date()): Promise<ShopQueue> {
  return loadShopQueue(shopId, now)
}

/** One entry's live status by its tracking code (the customer's view). */
export async function getQueueEntryByTrackingCode(trackingCode: string, now = new Date()): Promise<QueueEntryView> {
  const entry = await useDb().query.queueEntries.findFirst({
    where: eq(queueEntries.trackingCode, trackingCode),
    columns: {
      id: true,
      shopId: true,
      barberId: true,
      status: true,
      serviceName: true,
      durationMinutes: true,
      joinedAt: true,
      startedAt: true,
      endedAt: true
    }
  })
  if (!entry) {
    throw new DomainError('ENTRY_NOT_FOUND', 404, 'Queue entry not found')
  }

  const view: QueueEntryView = {
    ...entry,
    position: null,
    customersAhead: null,
    estimatedStart: null,
    estimatedEnd: null,
    waitMinutes: null,
    calculatedAt: now
  }

  if (!ACTIVE_STATUSES.includes(entry.status)) {
    return view
  }

  const { barbers: lanes } = await loadShopQueue(entry.shopId, now, entry.barberId)
  const state = lanes[0]?.state

  if (entry.status === 'IN_PROGRESS') {
    const current = state?.current?.entry.id === entry.id ? state.current : null
    return {
      ...view,
      customersAhead: 0,
      estimatedStart: entry.startedAt,
      estimatedEnd: current?.estimatedEnd ?? null,
      waitMinutes: 0
    }
  }

  const waiting = state?.waiting.find(item => item.entry.id === entry.id)
  if (!waiting) {
    return view
  }

  return {
    ...view,
    position: waiting.position,
    customersAhead: waiting.customersAhead,
    estimatedStart: waiting.estimatedStart,
    estimatedEnd: waiting.estimatedEnd,
    waitMinutes: waiting.waitMinutes
  }
}

async function findOrCreateCustomer(tx: Transaction, customer: AddCustomerInput['customer']): Promise<string> {
  if (!customer.phone) {
    const [created] = await tx.insert(customers).values({ name: customer.name }).returning({ id: customers.id })
    if (!created) {
      throw new Error('Failed to create customer')
    }
    return created.id
  }

  // Insert-or-select so two concurrent joins with the same new phone don't collide.
  // An existing customer's stored name is kept.
  const [created] = await tx
    .insert(customers)
    .values({ name: customer.name, phone: customer.phone })
    .onConflictDoNothing({ target: customers.phone })
    .returning({ id: customers.id })
  if (created) {
    return created.id
  }

  const existing = await tx.query.customers.findFirst({
    where: eq(customers.phone, customer.phone),
    columns: { id: true }
  })
  if (!existing) {
    throw new Error('Failed to find or create customer')
  }
  return existing.id
}

async function resolveBarberId(shopId: string, barberId: string | null | undefined, now: Date): Promise<string> {
  if (barberId) {
    const barber = await useDb().query.barbers.findFirst({
      where: and(eq(barbers.id, barberId), eq(barbers.shopId, shopId), eq(barbers.isActive, true)),
      columns: { id: true }
    })
    if (!barber) {
      throw new DomainError('BARBER_NOT_FOUND', 404, 'Barber not found or not available')
    }
    return barber.id
  }

  const { barbers: lanes } = await loadShopQueue(shopId, now)
  const best = pickEarliestAvailableLane(lanes.filter(lane => lane.barber.isActive))
  if (!best) {
    throw new DomainError('NO_BARBER_AVAILABLE', 409, 'No barber is available')
  }
  return best.barber.id
}

/** Adds a customer to a barber's queue (online join or walk-in). */
export async function addCustomer(input: AddCustomerInput): Promise<AddedQueueEntry> {
  const db = useDb()

  // Online customers are identified by phone; only a barber can add someone without one.
  if (input.source === 'ONLINE' && !input.customer.phone) {
    throw new DomainError('PHONE_REQUIRED', 400, 'A phone number is required to join the queue')
  }

  const shop = await db.query.shops.findFirst({ where: eq(shops.id, input.shopId), columns: { id: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }

  const service = await db.query.services.findFirst({
    where: and(eq(services.id, input.serviceId), eq(services.shopId, input.shopId), eq(services.isActive, true)),
    columns: { id: true, name: true, durationMinutes: true, priceMinor: true }
  })
  if (!service) {
    throw new DomainError('SERVICE_NOT_FOUND', 404, 'Service not found or not available')
  }

  const barberId = await resolveBarberId(input.shopId, input.barberId, new Date())

  let trackingCode: string
  try {
    trackingCode = await db.transaction(async (tx) => {
      const customerId = await findOrCreateCustomer(tx, input.customer)
      const [entry] = await tx
        .insert(queueEntries)
        .values({
          shopId: input.shopId,
          barberId,
          customerId,
          serviceId: service.id,
          source: input.source,
          // Snapshot, so later service edits don't change this entry.
          serviceName: service.name,
          durationMinutes: service.durationMinutes,
          priceMinor: service.priceMinor
        })
        .returning({ trackingCode: queueEntries.trackingCode })
      if (!entry) {
        throw new Error('Failed to insert queue entry')
      }
      return entry.trackingCode
    })
  }
  catch (error) {
    if (isUniqueViolation(error, ONE_ACTIVE_PER_CUSTOMER_SHOP)) {
      throw new DomainError('ALREADY_IN_QUEUE', 409, 'This customer is already in the queue')
    }
    throw error
  }

  return { trackingCode, entry: await getQueueEntryByTrackingCode(trackingCode) }
}

/**
 * Moves an entry to `to` only if its current status allows it. The status guard
 * lives in the UPDATE itself, so double-taps and concurrent devices can't both win.
 * Returns the recalculated queue.
 */
async function transitionEntry(shopId: string, entryId: string, to: QueueEntryStatus): Promise<ShopQueue> {
  const db = useDb()
  const timestamps = to === 'IN_PROGRESS' ? { startedAt: sql`now()` } : { endedAt: sql`now()` }

  let updated: { id: string }[]
  try {
    updated = await db
      .update(queueEntries)
      .set({ status: to, ...timestamps })
      .where(and(
        eq(queueEntries.id, entryId),
        eq(queueEntries.shopId, shopId),
        inArray(queueEntries.status, statusesThatCanTransitionTo(to))
      ))
      .returning({ id: queueEntries.id })
  }
  catch (error) {
    if (isUniqueViolation(error, ONE_IN_PROGRESS_PER_BARBER)) {
      throw new DomainError('BARBER_BUSY', 409, 'This barber is already serving a customer')
    }
    throw error
  }

  if (updated.length === 0) {
    const existing = await db.query.queueEntries.findFirst({
      where: and(eq(queueEntries.id, entryId), eq(queueEntries.shopId, shopId)),
      columns: { status: true }
    })
    if (!existing) {
      throw new DomainError('ENTRY_NOT_FOUND', 404, 'Queue entry not found')
    }
    throw new DomainError('INVALID_TRANSITION', 409, `Cannot change a ${existing.status} entry to ${to}`)
  }

  return getActiveQueue(shopId)
}

/** WAITING → IN_PROGRESS. Any waiting customer can be started (e.g. if #1 is late). */
export function startService(shopId: string, entryId: string): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'IN_PROGRESS')
}

/** IN_PROGRESS → COMPLETED. The next waiting customer becomes #1 automatically. */
export function completeService(shopId: string, entryId: string): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'COMPLETED')
}

/** WAITING or IN_PROGRESS → CANCELLED. */
export function cancelEntry(shopId: string, entryId: string): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'CANCELLED')
}

/** WAITING → NO_SHOW. */
export function markNoShow(shopId: string, entryId: string): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'NO_SHOW')
}
