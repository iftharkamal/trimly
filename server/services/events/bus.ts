// In-process domain events. Business code emits what happened; listeners
// (e.g. notifications) subscribe at startup. Emitters never know who listens,
// and a failing listener never fails the operation that emitted the event.
import type { DomainEvent } from './types'

type Listener = (event: DomainEvent) => Promise<void> | void

const listeners = new Set<Listener>()

/** Subscribes to every domain event. Returns an unsubscribe function. */
export function onDomainEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Delivers an event to every listener; errors are logged, not thrown. */
export async function emitDomainEvent(event: DomainEvent): Promise<void> {
  // async wrapper: a listener that throws synchronously becomes a rejection too.
  const results = await Promise.allSettled([...listeners].map(async listener => listener(event)))
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`Domain event listener failed for ${event.type}:`, result.reason)
    }
  }
}
