import { eq } from 'drizzle-orm'
import type { Transaction } from '../db'
import { customers } from '../db/schema'

export interface CustomerInput {
  name: string
  /** Normalized (E.164). Null for a walk-in who didn't give one. */
  phone: string | null
}

/**
 * The customer with this phone number, created if new. Without a phone,
 * always a new customer. An existing customer's stored name is kept.
 */
export async function findOrCreateCustomer(tx: Transaction, customer: CustomerInput): Promise<string> {
  if (!customer.phone) {
    const [created] = await tx.insert(customers).values({ name: customer.name }).returning({ id: customers.id })
    if (!created) {
      throw new Error('Failed to create customer')
    }
    return created.id
  }

  // Insert-or-select so two concurrent requests with the same new phone don't collide.
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
