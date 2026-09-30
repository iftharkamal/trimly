import { describe, expect, it } from 'vitest'
import { QUEUE_ENTRY_STATUSES } from '../../../shared/constants'
import { canTransition, statusesThatCanTransitionTo } from './transitions'

describe('canTransition', () => {
  it('allows the normal service flow', () => {
    expect(canTransition('WAITING', 'IN_PROGRESS')).toBe(true)
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('allows cancelling or marking no-show only where it makes sense', () => {
    expect(canTransition('WAITING', 'CANCELLED')).toBe(true)
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(true)
    expect(canTransition('WAITING', 'NO_SHOW')).toBe(true)
    expect(canTransition('IN_PROGRESS', 'NO_SHOW')).toBe(false)
  })

  it('does not allow skipping or reversing steps', () => {
    expect(canTransition('WAITING', 'COMPLETED')).toBe(false)
    expect(canTransition('IN_PROGRESS', 'WAITING')).toBe(false)
  })

  it('treats finished statuses as final', () => {
    for (const from of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const) {
      for (const to of QUEUE_ENTRY_STATUSES) {
        expect(canTransition(from, to)).toBe(false)
      }
    }
  })
})

describe('statusesThatCanTransitionTo', () => {
  it('lists the guard statuses for each target', () => {
    expect(statusesThatCanTransitionTo('IN_PROGRESS')).toEqual(['WAITING'])
    expect(statusesThatCanTransitionTo('COMPLETED')).toEqual(['IN_PROGRESS'])
    expect(statusesThatCanTransitionTo('CANCELLED')).toEqual(['WAITING', 'IN_PROGRESS'])
    expect(statusesThatCanTransitionTo('NO_SHOW')).toEqual(['WAITING'])
  })
})
