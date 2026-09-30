import { relations } from 'drizzle-orm'
import { appointments } from './appointments'
import { user } from './auth'
import { barbers } from './barbers'
import { customers } from './customers'
import { payments } from './payments'
import { queueEntries } from './queue'
import { services } from './services'
import { shopHours } from './shop-hours'
import { shops } from './shops'

export const shopsRelations = relations(shops, ({ one, many }) => ({
  owner: one(user, { fields: [shops.ownerUserId], references: [user.id] }),
  barbers: many(barbers),
  services: many(services),
  queueEntries: many(queueEntries),
  appointments: many(appointments),
  hours: many(shopHours)
}))

export const shopHoursRelations = relations(shopHours, ({ one }) => ({
  shop: one(shops, { fields: [shopHours.shopId], references: [shops.id] })
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  shop: one(shops, { fields: [appointments.shopId], references: [shops.id] }),
  barber: one(barbers, { fields: [appointments.barberId], references: [barbers.id] }),
  customer: one(customers, { fields: [appointments.customerId], references: [customers.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
  queueEntry: one(queueEntries, { fields: [appointments.queueEntryId], references: [queueEntries.id] })
}))

export const barbersRelations = relations(barbers, ({ one, many }) => ({
  shop: one(shops, { fields: [barbers.shopId], references: [shops.id] }),
  queueEntries: many(queueEntries)
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  shop: one(shops, { fields: [services.shopId], references: [shops.id] }),
  queueEntries: many(queueEntries)
}))

export const customersRelations = relations(customers, ({ many }) => ({
  queueEntries: many(queueEntries)
}))

export const queueEntriesRelations = relations(queueEntries, ({ one }) => ({
  shop: one(shops, { fields: [queueEntries.shopId], references: [shops.id] }),
  barber: one(barbers, { fields: [queueEntries.barberId], references: [barbers.id] }),
  customer: one(customers, { fields: [queueEntries.customerId], references: [customers.id] }),
  service: one(services, { fields: [queueEntries.serviceId], references: [services.id] }),
  payment: one(payments)
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  queueEntry: one(queueEntries, { fields: [payments.queueEntryId], references: [queueEntries.id] })
}))
