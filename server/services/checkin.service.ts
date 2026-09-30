// Check-in: an appointment customer has arrived. The appointment becomes a
// queue entry ordered by its booked time, in one transaction. Lives outside
// both modules because it needs both (and the queue already reads appointments).
import { useDb } from '../db'
import { lockBookedAppointment, markCheckedIn, getAppointment } from './appointment.service'
import { DomainError } from './errors'
import { getActiveQueue, insertCheckedInEntry, type ShopQueue } from './queue/queue.service'

/** BOOKED appointment → queue entry. Returns the recalculated queue. */
export async function checkInAppointment(shopId: string, appointmentId: string): Promise<ShopQueue> {
  const checkedIn = await useDb().transaction(async (tx) => {
    const appointment = await lockBookedAppointment(tx, shopId, appointmentId)
    if (!appointment) {
      return false
    }

    const queueEntryId = await insertCheckedInEntry(tx, {
      shopId,
      barberId: appointment.barberId,
      customerId: appointment.customerId,
      serviceId: appointment.serviceId,
      serviceName: appointment.serviceName,
      durationMinutes: appointment.durationMinutes,
      priceMinor: appointment.priceMinor,
      orderAt: appointment.startsAt
    })
    await markCheckedIn(tx, appointment.id, queueEntryId)
    return true
  })

  if (!checkedIn) {
    // Not found (404) or no longer BOOKED (409).
    const existing = await getAppointment(shopId, appointmentId)
    throw new DomainError('INVALID_TRANSITION', 409, `Cannot check in a ${existing.status} appointment`)
  }

  return getActiveQueue(shopId)
}
