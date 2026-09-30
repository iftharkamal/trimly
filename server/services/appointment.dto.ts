import type { AppointmentDto } from '../../shared/types/appointment'
import type { AppointmentView } from './appointment.service'

export function toAppointmentDto(view: AppointmentView): AppointmentDto {
  return {
    id: view.id,
    status: view.status,
    source: view.source,
    trackingCode: view.trackingCode,
    startsAt: view.startsAt.toISOString(),
    endsAt: view.endsAt.toISOString(),
    serviceName: view.serviceName,
    durationMinutes: view.durationMinutes,
    priceMinor: view.priceMinor,
    barber: { ...view.barber },
    customer: { ...view.customer },
    queueEntryId: view.queueEntryId,
    checkedInAt: view.checkedInAt?.toISOString() ?? null,
    endedAt: view.endedAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString()
  }
}
