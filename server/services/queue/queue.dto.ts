// Maps queue service results to API response shapes. Dates become ISO strings;
// the public view drops everything that identifies a customer.
import type {
  BarberQueueDto,
  OwnerShopQueueDto,
  PublicQueueEntryDto,
  PublicShopQueueDto,
  QueueEntryDto,
  QueueEntryStatusDto,
  QueueTrackingDto
} from '../../../shared/types/queue'
import type { ActiveQueueEntry, BarberQueue, QueueEntryView, QueueTracking, ShopQueue } from './queue.service'

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

function toBarberQueueDto<E>(
  lane: BarberQueue,
  mapEntry: (entry: ActiveQueueEntry) => E,
  showIdentity: boolean
): BarberQueueDto<E> {
  const { current, waiting, nextAvailableAt } = lane.state
  const { joinPreview } = lane
  return {
    barber: { id: lane.barber.id, name: lane.barber.name, isActive: lane.barber.isActive },
    current: current
      ? {
          entry: mapEntry(current.entry),
          elapsedMinutes: current.elapsedMinutes,
          estimatedEnd: current.estimatedEnd.toISOString(),
          isOverrunning: current.isOverrunning
        }
      : null,
    waiting: waiting.map(item => ({
      entry: mapEntry(item.entry),
      position: item.position,
      customersAhead: item.customersAhead,
      estimatedStart: item.estimatedStart.toISOString(),
      estimatedEnd: item.estimatedEnd.toISOString(),
      waitMinutes: item.waitMinutes
    })),
    nextAvailableAt: nextAvailableAt.toISOString(),
    joinPreview: {
      position: joinPreview.position,
      customersAhead: joinPreview.customersAhead,
      estimatedStart: joinPreview.estimatedStart.toISOString(),
      waitMinutes: joinPreview.waitMinutes
    },
    upcoming: lane.upcoming.map(hold => ({
      startsAt: hold.start.toISOString(),
      endsAt: hold.end.toISOString(),
      serviceName: hold.serviceName,
      ...(showIdentity ? { appointmentId: hold.appointmentId, customerName: hold.customerName } : {})
    }))
  }
}

function toQueueEntryDto(entry: ActiveQueueEntry): QueueEntryDto {
  return {
    id: entry.id,
    status: entry.status,
    source: entry.source,
    serviceName: entry.serviceName,
    durationMinutes: entry.durationMinutes,
    priceMinor: entry.priceMinor,
    joinedAt: entry.joinedAt.toISOString(),
    startedAt: isoOrNull(entry.startedAt),
    customer: { ...entry.customer }
  }
}

function toPublicQueueEntryDto(entry: ActiveQueueEntry): PublicQueueEntryDto {
  return { serviceName: entry.serviceName, durationMinutes: entry.durationMinutes }
}

export function toOwnerQueueDto(queue: ShopQueue): OwnerShopQueueDto {
  return {
    view: 'owner',
    shopId: queue.shopId,
    calculatedAt: queue.calculatedAt.toISOString(),
    barbers: queue.barbers.map(lane => toBarberQueueDto(lane, toQueueEntryDto, true)),
    soonestBarberId: queue.soonestBarberId
  }
}

export function toPublicQueueDto(queue: ShopQueue): PublicShopQueueDto {
  return {
    view: 'public',
    shopId: queue.shopId,
    calculatedAt: queue.calculatedAt.toISOString(),
    barbers: queue.barbers.map(lane => toBarberQueueDto(lane, toPublicQueueEntryDto, false)),
    soonestBarberId: queue.soonestBarberId
  }
}

export function toQueueEntryStatusDto(view: QueueEntryView): QueueEntryStatusDto {
  return {
    id: view.id,
    shopId: view.shopId,
    barberId: view.barberId,
    status: view.status,
    serviceName: view.serviceName,
    durationMinutes: view.durationMinutes,
    joinedAt: view.joinedAt.toISOString(),
    startedAt: isoOrNull(view.startedAt),
    endedAt: isoOrNull(view.endedAt),
    position: view.position,
    customersAhead: view.customersAhead,
    estimatedStart: isoOrNull(view.estimatedStart),
    estimatedEnd: isoOrNull(view.estimatedEnd),
    waitMinutes: view.waitMinutes,
    calculatedAt: view.calculatedAt.toISOString()
  }
}

export function toQueueTrackingDto(tracking: QueueTracking): QueueTrackingDto {
  return {
    ...toQueueEntryStatusDto(tracking.view),
    state: tracking.state,
    customerName: tracking.customerName,
    priceMinor: tracking.priceMinor,
    barberName: tracking.barberName,
    shop: { ...tracking.shop }
  }
}
