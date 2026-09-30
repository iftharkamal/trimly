// Queue use cases: loads rows, delegates all ordering/ETA math to the pure
// functions in queue-state.ts, and maps database constraints to domain errors.
// ETAs are never stored; every read (and every mutation's result) recalculates them.
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import type { QueueEntrySource, QueueEntryStatus, TrackingState } from '../../../shared/constants'
import type { PaymentInput } from '../../../shared/schemas/payment'
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
import { getHoldsByBarber, type AppointmentHold } from '../appointment.service'
import { findOrCreateCustomer } from '../customer.service'
import { localDayRange, type TimeRange } from '../day-range'
import { DomainError } from '../errors'
import { recordPayment } from '../payment.service'
import {
  calculateJoinPreview,
  calculateQueueState,
  pickEarliestAvailableLane,
  type JoinPreview,
  type QueueState
} from './queue-state'
import { getTrackingState } from './tracking'
import { statusesThatCanTransitionTo } from './transitions'

const ACTIVE_STATUSES: QueueEntryStatus[] = ['WAITING', 'IN_PROGRESS']
const MINUTE_MS = 60_000

export interface ActiveQueueEntry {
  id: string
  status: QueueEntryStatus
  source: QueueEntrySource
  joinedAt: Date
  /** Queue order key (booked time for a checked-in appointment). */
  orderAt: Date
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
  /** What a customer joining this barber now could expect. */
  joinPreview: JoinPreview
  /** Booked appointments not yet checked in, holding time (earliest first). */
  upcoming: AppointmentHold[]
}

export interface ShopQueue {
  shopId: string
  calculatedAt: Date
  barbers: BarberQueue[]
  /** The active barber a customer choosing "any barber" would get, if any. */
  soonestBarberId: string | null
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

  const [shopBarbers, entryRows, recentEnds, holdsByBarber] = await Promise.all([
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
        orderAt: queueEntries.orderAt,
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
      .orderBy(queueEntries.barberId, desc(queueEntries.endedAt)),

    // Booked appointments hold their time until the customer checks in.
    getHoldsByBarber(shopId, now, barberId)
  ])

  const entriesByBarber = new Map<string, ActiveQueueEntry[]>()
  for (const { barberId: entryBarberId, customerId, customerName, customerPhone, ...entry } of entryRows) {
    const lane = entriesByBarber.get(entryBarberId) ?? []
    lane.push({ ...entry, customer: { id: customerId, name: customerName, phone: customerPhone } })
    entriesByBarber.set(entryBarberId, lane)
  }

  const lastEndByBarber = new Map(recentEnds.map(row => [row.barberId, row.endedAt]))

  const lanes = shopBarbers
    // A deactivated barber still shows while customers remain in their queue.
    .filter(barber => barber.isActive || entriesByBarber.has(barber.id))
    .map((barber) => {
      const upcoming = holdsByBarber.get(barber.id) ?? []
      const state = calculateQueueState(entriesByBarber.get(barber.id) ?? [], {
        now,
        bufferMinutes: shop.serviceBufferMinutes,
        lastServiceEndedAt: lastEndByBarber.get(barber.id) ?? null,
        holds: upcoming
      })
      return { barber, state, joinPreview: calculateJoinPreview(state, now), upcoming }
    })

  return {
    shopId,
    calculatedAt: now,
    barbers: lanes,
    soonestBarberId: pickEarliestAvailableLane(lanes.filter(lane => lane.barber.isActive))?.barber.id ?? null
  }
}

/** Every barber's live queue with positions and ETAs, calculated now. */
export function getActiveQueue(shopId: string, now = new Date()): Promise<ShopQueue> {
  return loadShopQueue(shopId, now)
}

export interface TodayStats {
  /** Joined today and not cancelled or marked no-show. */
  customers: number
  servicesCompleted: number
}

/** Today's numbers, where "today" is the current calendar day in the shop's timezone. */
export async function getTodayStats(shopId: string, now = new Date()): Promise<TodayStats> {
  const db = useDb()

  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId), columns: { timezone: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }

  const today = localDayRange(shop.timezone, now)
  const joinedToday = and(gte(queueEntries.joinedAt, today.start), lt(queueEntries.joinedAt, today.end))
  const endedToday = and(gte(queueEntries.endedAt, today.start), lt(queueEntries.endedAt, today.end))
  const completedToday = and(eq(queueEntries.status, 'COMPLETED'), endedToday)

  const [row] = await db
    .select({
      customers: sql<number>`count(*) filter (where ${joinedToday} and ${queueEntries.status} not in ('CANCELLED', 'NO_SHOW'))`.mapWith(Number),
      servicesCompleted: sql<number>`count(*) filter (where ${completedToday})`.mapWith(Number)
    })
    .from(queueEntries)
    .where(and(eq(queueEntries.shopId, shopId), or(joinedToday, endedToday)))

  return row ?? { customers: 0, servicesCompleted: 0 }
}

/**
 * Work done in a time range: services completed, and how many different
 * customers they were for.
 */
export async function getServiceSummary(shopId: string, range: TimeRange): Promise<{ services: number, customers: number }> {
  const [row] = await useDb()
    .select({
      services: sql<number>`count(*)`.mapWith(Number),
      customers: sql<number>`count(distinct ${queueEntries.customerId})`.mapWith(Number)
    })
    .from(queueEntries)
    .where(and(
      eq(queueEntries.shopId, shopId),
      eq(queueEntries.status, 'COMPLETED'),
      gte(queueEntries.endedAt, range.start),
      lt(queueEntries.endedAt, range.end)
    ))

  return row ?? { services: 0, customers: 0 }
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

export interface CheckedInEntryInput {
  shopId: string
  barberId: string
  customerId: string
  serviceId: string
  serviceName: string
  durationMinutes: number
  priceMinor: number
  /** The booked time: orders the entry among walk-ins. */
  orderAt: Date
}

/**
 * Adds a checked-in appointment to its barber's queue, inside the caller's
 * transaction. Ordered by its booked time rather than its arrival.
 */
export async function insertCheckedInEntry(tx: Transaction, input: CheckedInEntryInput): Promise<string> {
  try {
    const [entry] = await tx
      .insert(queueEntries)
      .values({ ...input, source: 'APPOINTMENT' })
      .returning({ id: queueEntries.id })
    if (!entry) {
      throw new Error('Failed to insert queue entry')
    }
    return entry.id
  }
  catch (error) {
    if (isUniqueViolation(error, ONE_ACTIVE_PER_CUSTOMER_SHOP)) {
      throw new DomainError('ALREADY_IN_QUEUE', 409, 'This customer is already in the queue')
    }
    throw error
  }
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

  const { soonestBarberId } = await loadShopQueue(shopId, now)
  if (!soonestBarberId) {
    throw new DomainError('NO_BARBER_AVAILABLE', 409, 'No barber is available')
  }
  return soonestBarberId
}

/** Adds a customer to a barber's queue (online join or walk-in). */
export async function addCustomer(input: AddCustomerInput): Promise<AddedQueueEntry> {
  const db = useDb()

  // Online customers are identified by phone; only a barber can add someone without one.
  if (input.source === 'ONLINE' && !input.customer.phone) {
    throw new DomainError('PHONE_REQUIRED', 400, 'A phone number is required to join the queue')
  }

  const shop = await db.query.shops.findFirst({ where: eq(shops.id, input.shopId), columns: { isOpen: true } })
  if (!shop) {
    throw new DomainError('SHOP_NOT_FOUND', 404, 'Shop not found')
  }
  // Closing only stops online joins; the barber can still add walk-ins.
  if (input.source === 'ONLINE' && !shop.isOpen) {
    throw new DomainError('SHOP_CLOSED', 409, 'The shop is not taking online customers right now')
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
 * `afterTransition` runs in the same transaction (e.g. recording a payment), so
 * either both happen or neither does. Returns the recalculated queue.
 */
async function transitionEntry(
  shopId: string,
  entryId: string,
  to: QueueEntryStatus,
  afterTransition?: (tx: Transaction) => Promise<void>
): Promise<ShopQueue> {
  const db = useDb()
  const timestamps = to === 'IN_PROGRESS' ? { startedAt: sql`now()` } : { endedAt: sql`now()` }

  let moved: boolean
  try {
    moved = await db.transaction(async (tx) => {
      const updated = await tx
        .update(queueEntries)
        .set({ status: to, ...timestamps })
        .where(and(
          eq(queueEntries.id, entryId),
          eq(queueEntries.shopId, shopId),
          inArray(queueEntries.status, statusesThatCanTransitionTo(to))
        ))
        .returning({ id: queueEntries.id })
      if (updated.length === 0) {
        return false
      }
      await afterTransition?.(tx)
      return true
    })
  }
  catch (error) {
    if (isUniqueViolation(error, ONE_IN_PROGRESS_PER_BARBER)) {
      throw new DomainError('BARBER_BUSY', 409, 'This barber is already serving a customer')
    }
    throw error
  }

  if (!moved) {
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

/**
 * IN_PROGRESS → COMPLETED, optionally recording how the customer paid in the
 * same transaction. The next waiting customer becomes #1 automatically.
 */
export function completeService(shopId: string, entryId: string, payment?: PaymentInput | null): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'COMPLETED', payment ? tx => recordPayment(tx, entryId, payment) : undefined)
}

/** WAITING or IN_PROGRESS → CANCELLED. */
export function cancelEntry(shopId: string, entryId: string): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'CANCELLED')
}

/** WAITING → NO_SHOW. */
export function markNoShow(shopId: string, entryId: string): Promise<ShopQueue> {
  return transitionEntry(shopId, entryId, 'NO_SHOW')
}

/** Everything the customer's status page shows for one entry. */
export interface QueueTracking {
  view: QueueEntryView
  state: TrackingState
  customerName: string
  priceMinor: number
  barberName: string
  shop: {
    name: string
    slug: string
    timezone: string
    currency: string
  }
}

/** The customer's live status page data, by tracking code. */
export async function getTracking(trackingCode: string, now = new Date()): Promise<QueueTracking> {
  const view = await getQueueEntryByTrackingCode(trackingCode, now)

  const details = await useDb().query.queueEntries.findFirst({
    where: eq(queueEntries.id, view.id),
    columns: { priceMinor: true },
    with: {
      shop: { columns: { name: true, slug: true, timezone: true, currency: true } },
      barber: { columns: { name: true } },
      customer: { columns: { name: true } }
    }
  })
  if (!details) {
    throw new DomainError('ENTRY_NOT_FOUND', 404, 'Queue entry not found')
  }

  return {
    view,
    state: getTrackingState(view),
    customerName: details.customer.name,
    priceMinor: details.priceMinor,
    barberName: details.barber.name,
    shop: details.shop
  }
}

/**
 * The customer leaves the queue themselves. Only while WAITING: once in the
 * chair, only the barber can change the entry.
 */
export async function leaveQueue(trackingCode: string): Promise<QueueTracking> {
  const db = useDb()

  const updated = await db
    .update(queueEntries)
    .set({ status: 'CANCELLED', endedAt: sql`now()` })
    .where(and(eq(queueEntries.trackingCode, trackingCode), eq(queueEntries.status, 'WAITING')))
    .returning({ id: queueEntries.id })

  if (updated.length === 0) {
    const existing = await db.query.queueEntries.findFirst({
      where: eq(queueEntries.trackingCode, trackingCode),
      columns: { status: true }
    })
    if (!existing) {
      throw new DomainError('ENTRY_NOT_FOUND', 404, 'Queue entry not found')
    }
    throw new DomainError('INVALID_TRANSITION', 409, 'You can only leave the queue while waiting')
  }

  return getTracking(trackingCode)
}
