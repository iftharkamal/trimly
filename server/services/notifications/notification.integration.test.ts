// Notifications against PostgreSQL, subscribed to domain events the way the
// server plugin does it.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShopFixture, resetDatabase, type ShopFixture } from '../../testing/fixtures'
import { bookOnline, cancelBooking, getAvailability } from '../booking.service'
import { onDomainEvent } from '../events/bus'
import { addCustomer, completeService, leaveQueue, startService } from '../queue/queue.service'
import { setOpeningHours } from '../shop.service'
import type { NotificationChannel } from './channels'
import { listCustomerNotifications, listShopNotifications, publishNotification } from './notification.service'

let shop: ShopFixture
let unsubscribe: () => void

beforeAll(() => {
  unsubscribe = onDomainEvent(async (event) => {
    await publishNotification(event)
  })
})

afterAll(() => unsubscribe())

beforeEach(async () => {
  await resetDatabase()
  shop = await createShopFixture({ bufferMinutes: 5 })
})

async function join(name: string, source: 'ONLINE' | 'WALK_IN' = 'WALK_IN', phone: string | null = null) {
  return addCustomer({
    shopId: shop.shopId,
    customer: { name, phone },
    serviceId: shop.services.haircut,
    barberId: shop.barberId,
    source
  })
}

/** Everything a feed holds (reading from the beginning). */
async function customerTitles(entryId: string) {
  return (await listCustomerNotifications(entryId, 0)).notifications.map(item => item.title)
}

async function shopTitles() {
  return (await listShopNotifications(shop.shopId, 0)).notifications.map(item => item.title)
}

describe('publishNotification', () => {
  const event = { type: 'CUSTOMER_LEFT_QUEUE', shopId: '', entryId: '', customerName: 'A' } as const

  it('stores and delivers a notification only once per event', async () => {
    const { entry } = await join('A')
    const delivered = vi.fn()
    const channel: NotificationChannel = { name: 'test', deliver: delivered }
    const same = { ...event, shopId: shop.shopId, entryId: entry.id }

    expect(await publishNotification(same, [channel])).not.toBeNull()
    expect(await publishNotification(same, [channel])).toBeNull()
    expect(delivered).toHaveBeenCalledTimes(1)
  })

  it('keeps delivering to other channels when one fails', async () => {
    const { entry } = await join('A')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const delivered = vi.fn()

    const stored = await publishNotification({ ...event, shopId: shop.shopId, entryId: entry.id, customerName: 'B' }, [
      { name: 'broken', deliver: async () => { throw new Error('provider down') } },
      { name: 'working', deliver: delivered }
    ])

    expect(stored).not.toBeNull()
    expect(delivered).toHaveBeenCalledTimes(1)
    errors.mockRestore()
  })
})

describe('getting close', () => {
  it('alerts each waiting customer once, when their wait reaches 15 minutes', async () => {
    const a = (await join('A')).entry // starts now: close straight away
    const b = (await join('B')).entry // 20 + 5 = 25 min away
    const c = (await join('C')).entry // 50 min away

    expect(await customerTitles(a.id)).toEqual(['Getting close at Test Barber'])
    expect(await customerTitles(b.id)).toEqual([])

    await startService(shop.shopId, a.id) // B still 25 min away
    expect(await customerTitles(b.id)).toEqual([])

    await completeService(shop.shopId, a.id) // A finished early: B starts in 5 min
    expect(await customerTitles(b.id)).toEqual(['Getting close at Test Barber'])
    expect(await customerTitles(c.id)).toEqual([])

    // More changes don't repeat it.
    await startService(shop.shopId, b.id)
    expect(await customerTitles(b.id)).toHaveLength(1)
  })
})

describe('shop alerts', () => {
  it('tells the shop when someone joins online or leaves, not about walk-ins', async () => {
    await join('Walk-in')
    const online = await join('Arjun', 'ONLINE', '+919990000500')

    await leaveQueue(online.trackingCode)

    expect(await shopTitles()).toEqual(['Arjun joined the queue', 'Arjun left the queue'])
  })

  it('tells the shop about online bookings and customer cancellations', async () => {
    await setOpeningHours(shop.shopId, {
      days: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, ranges: [{ opens: '00:00', closes: '23:59' }] }))
    })
    const slot = (await getAvailability(shop.shopId, shop.services.haircut, null)).days.flatMap(day => day.slots)[0]!

    const appointment = await bookOnline({
      shopId: shop.shopId,
      serviceId: shop.services.haircut,
      barberId: null,
      customer: { name: 'Nabil', phone: '+919990000501' },
      startsAt: slot.startsAt
    })
    await cancelBooking(appointment.trackingCode)

    expect(await shopTitles()).toEqual(['New booking: Nabil', 'Nabil cancelled'])
  })

  it('never lets a broken notification listener break the queue', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const off = onDomainEvent(() => {
      throw new Error('provider down')
    })

    await expect(join('Still works', 'ONLINE', '+919990000502')).resolves.toBeDefined()

    off()
    errors.mockRestore()
  })
})

describe('feeds', () => {
  it('start from "now" and then return only newer notifications', async () => {
    await join('Before', 'ONLINE', '+919990000510')

    const start = await listShopNotifications(shop.shopId)
    expect(start.notifications).toEqual([])

    await join('After', 'ONLINE', '+919990000511')
    const next = await listShopNotifications(shop.shopId, start.cursor)
    expect(next.notifications.map(item => item.title)).toEqual(['After joined the queue'])

    expect((await listShopNotifications(shop.shopId, next.cursor)).notifications).toEqual([])
  })

  it('keep customer alerts to that customer, and out of the shop feed', async () => {
    const a = (await join('A')).entry
    const b = (await join('B')).entry

    expect(await customerTitles(a.id)).toHaveLength(1)
    expect(await customerTitles(b.id)).toHaveLength(0)
    expect(await shopTitles()).toEqual([])
  })
})
