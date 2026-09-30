// Appointments: booked times with a specific barber. A booked appointment
// holds its time in the queue's ETAs until the customer checks in (see
// checkin.service.ts), is cancelled or is marked a no-show.
import { and, asc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm'
import type { AppointmentStatus, BookingSource } from '../../shared/constants'
import { useDb, type Transaction } from '../db'
import { isExclusionViolation, isUniqueViolation } from '../db/errors'
import {
  appointments,
  barbers,
  customers,
  NO_OVERLAPPING_APPOINTMENTS,
  ONE_BOOKING_PER_CUSTOMER_SHOP,
  services
} from '../db/schema'
import { findOrCreateCustomer, type CustomerInput } from './customer.service'
import type { TimeRange } from './day-range'
import { DomainError } from './errors'
import type { TimeHold } from './queue/queue-state'

const MINUTE_MS = 60_000
const HOLD_HORIZON_MS = 24 * 60 * MINUTE_MS

export interface AppointmentView {
  id: string
  shopId: string
  status: AppointmentStatus
  source: BookingSource
  trackingCode: string
  startsAt: Date
  endsAt: Date
  serviceName: string
  durationMinutes: number
  priceMinor: number
  barber: { id: string, name: string }
  customer: { id: string, name: string, phone: string | null }
  queueEntryId: string | null
  checkedInAt: Date | null
  endedAt: Date | null
  createdAt: Date
}

export interface CreateAppointmentInput {
  shopId: string
  /** Omit for "any barber": the first active barber free at that time. */
  barberId?: string | null
  customer: CustomerInput
  serviceId: string
  startsAt: Date
  source: BookingSource
}

const VIEW_COLUMNS = {
  id: appointments.id,
  shopId: appointments.shopId,
  status: appointments.status,
  source: appointments.source,
  trackingCode: appointments.trackingCode,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  serviceName: appointments.serviceName,
  durationMinutes: appointments.durationMinutes,
  priceMinor: appointments.priceMinor,
  queueEntryId: appointments.queueEntryId,
  checkedInAt: appointments.checkedInAt,
  endedAt: appointments.endedAt,
  createdAt: appointments.createdAt,
  barberId: barbers.id,
  barberName: barbers.name,
  customerId: customers.id,
  customerName: customers.name,
  customerPhone: customers.phone
}

type ViewRow = Omit<AppointmentView, 'barber' | 'customer'> & {
  barberId: string
  barberName: string
  customerId: string
  customerName: string
  customerPhone: string | null
}

function toView({ barberId, barberName, customerId, customerName, customerPhone, ...row }: ViewRow): AppointmentView {
  return {
    ...row,
    barber: { id: barberId, name: barberName },
    customer: { id: customerId, name: customerName, phone: customerPhone }
  }
}

function selectViews(db: ReturnType<typeof useDb> | Transaction) {
  return db
    .select(VIEW_COLUMNS)
    .from(appointments)
    .innerJoin(barbers, eq(barbers.id, appointments.barberId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
}

export async function getAppointment(shopId: string, appointmentId: string): Promise<AppointmentView> {
  const [row] = await selectViews(useDb())
    .where(and(eq(appointments.id, appointmentId), eq(appointments.shopId, shopId)))
  if (!row) {
    throw new DomainError('APPOINTMENT_NOT_FOUND', 404, 'Appointment not found')
  }
  return toView(row)
}

/** Appointments starting in the range, earliest first. */
export async function listAppointments(shopId: string, range: TimeRange): Promise<AppointmentView[]> {
  const rows = await selectViews(useDb())
    .where(and(
      eq(appointments.shopId, shopId),
      gte(appointments.startsAt, range.start),
      lt(appointments.startsAt, range.end)
    ))
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
  return rows.map(toView)
}

async function activeBarberIds(shopId: string, barberId: string | null | undefined): Promise<string[]> {
  const rows = await useDb()
    .select({ id: barbers.id })
    .from(barbers)
    .where(and(
      eq(barbers.shopId, shopId),
      eq(barbers.isActive, true),
      barberId ? eq(barbers.id, barberId) : undefined
    ))
    .orderBy(asc(barbers.createdAt))
  if (barberId && rows.length === 0) {
    throw new DomainError('BARBER_NOT_FOUND', 404, 'Barber not found or not available')
  }
  return rows.map(row => row.id)
}

/**
 * Books an appointment. Postgres rejects a time that overlaps another active
 * booking for the same barber, so two people can't take the same slot even
 * when booking at the same moment.
 */
export async function createAppointment(input: CreateAppointmentInput, now = new Date()): Promise<AppointmentView> {
  if (input.startsAt <= now) {
    throw new DomainError('INVALID_TIME', 400, 'Appointments must be in the future')
  }

  const service = await useDb().query.services.findFirst({
    where: and(eq(services.id, input.serviceId), eq(services.shopId, input.shopId), eq(services.isActive, true)),
    columns: { id: true, name: true, durationMinutes: true, priceMinor: true }
  })
  if (!service) {
    throw new DomainError('SERVICE_NOT_FOUND', 404, 'Service not found or not available')
  }

  const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * MINUTE_MS)
  const candidates = await activeBarberIds(input.shopId, input.barberId)

  // "Any barber": try each active barber until one is free at that time.
  for (const barberId of candidates) {
    try {
      const id = await useDb().transaction(async (tx) => {
        const customerId = await findOrCreateCustomer(tx, input.customer)
        const [row] = await tx
          .insert(appointments)
          .values({
            shopId: input.shopId,
            barberId,
            customerId,
            serviceId: service.id,
            source: input.source,
            serviceName: service.name,
            durationMinutes: service.durationMinutes,
            priceMinor: service.priceMinor,
            startsAt: input.startsAt,
            endsAt
          })
          .returning({ id: appointments.id })
        if (!row) {
          throw new Error('Failed to insert appointment')
        }
        return row.id
      })
      return await getAppointment(input.shopId, id)
    }
    catch (error) {
      if (isExclusionViolation(error, NO_OVERLAPPING_APPOINTMENTS)) {
        continue
      }
      if (isUniqueViolation(error, ONE_BOOKING_PER_CUSTOMER_SHOP)) {
        throw new DomainError('ALREADY_BOOKED', 409, 'This customer already has an upcoming appointment')
      }
      throw error
    }
  }

  throw new DomainError('SLOT_TAKEN', 409, 'That time is already booked')
}

/** BOOKED → CANCELLED or NO_SHOW, only if still booked (guarded like queue transitions). */
async function closeAppointment(shopId: string, appointmentId: string, to: 'CANCELLED' | 'NO_SHOW'): Promise<AppointmentView> {
  const db = useDb()
  const updated = await db
    .update(appointments)
    .set({ status: to, endedAt: sql`now()` })
    .where(and(eq(appointments.id, appointmentId), eq(appointments.shopId, shopId), eq(appointments.status, 'BOOKED')))
    .returning({ id: appointments.id })

  if (updated.length === 0) {
    const existing = await getAppointment(shopId, appointmentId)
    throw new DomainError('INVALID_TRANSITION', 409, `Cannot change a ${existing.status} appointment to ${to}`)
  }
  return getAppointment(shopId, appointmentId)
}

export function cancelAppointment(shopId: string, appointmentId: string): Promise<AppointmentView> {
  return closeAppointment(shopId, appointmentId, 'CANCELLED')
}

export function markAppointmentNoShow(shopId: string, appointmentId: string): Promise<AppointmentView> {
  return closeAppointment(shopId, appointmentId, 'NO_SHOW')
}

/** A booked appointment still waiting for its customer, holding the barber's time. */
export interface AppointmentHold extends TimeHold {
  appointmentId: string
  customerName: string
  serviceName: string
}

/**
 * Time held per barber by appointments still waiting for their customer:
 * BOOKED, not yet over, starting within the next 24 hours. Earliest first.
 */
export async function getHoldsByBarber(shopId: string, now: Date, barberId?: string): Promise<Map<string, AppointmentHold[]>> {
  const rows = await useDb()
    .select({
      barberId: appointments.barberId,
      start: appointments.startsAt,
      end: appointments.endsAt,
      appointmentId: appointments.id,
      customerName: customers.name,
      serviceName: appointments.serviceName
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(and(
      eq(appointments.shopId, shopId),
      eq(appointments.status, 'BOOKED'),
      gt(appointments.endsAt, now),
      lt(appointments.startsAt, new Date(now.getTime() + HOLD_HORIZON_MS)),
      barberId ? eq(appointments.barberId, barberId) : undefined
    ))
    .orderBy(asc(appointments.startsAt))

  const holds = new Map<string, AppointmentHold[]>()
  for (const { barberId: id, ...hold } of rows) {
    holds.set(id, [...(holds.get(id) ?? []), hold])
  }
  return holds
}

/** Locks a BOOKED appointment for check-in; null if it isn't bookable any more. */
export async function lockBookedAppointment(tx: Transaction, shopId: string, appointmentId: string) {
  const [row] = await tx
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.id, appointmentId),
      eq(appointments.shopId, shopId),
      inArray(appointments.status, ['BOOKED'])
    ))
    .for('update')
  return row ?? null
}

export async function markCheckedIn(tx: Transaction, appointmentId: string, queueEntryId: string): Promise<void> {
  await tx
    .update(appointments)
    .set({ status: 'CHECKED_IN', queueEntryId, checkedInAt: sql`now()` })
    .where(eq(appointments.id, appointmentId))
}
