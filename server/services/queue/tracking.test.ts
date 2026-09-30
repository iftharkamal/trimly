import { describe, expect, it } from 'vitest'
import { GETTING_CLOSE_MINUTES } from '../../../shared/constants'
import { getTrackingState } from './tracking'

describe('getTrackingState', () => {
  it('is YOU_ARE_NEXT at position 1, even while someone is in the chair', () => {
    expect(getTrackingState({ status: 'WAITING', position: 1, waitMinutes: 25 })).toBe('YOU_ARE_NEXT')
  })

  it('is GETTING_CLOSE when the wait is within the threshold', () => {
    expect(getTrackingState({ status: 'WAITING', position: 2, waitMinutes: GETTING_CLOSE_MINUTES })).toBe('GETTING_CLOSE')
    expect(getTrackingState({ status: 'WAITING', position: 3, waitMinutes: 5 })).toBe('GETTING_CLOSE')
  })

  it('is WAITING when the wait is longer', () => {
    expect(getTrackingState({ status: 'WAITING', position: 3, waitMinutes: GETTING_CLOSE_MINUTES + 1 })).toBe('WAITING')
  })

  it('follows the entry status once the customer is no longer waiting', () => {
    expect(getTrackingState({ status: 'IN_PROGRESS', position: null, waitMinutes: 0 })).toBe('IN_PROGRESS')
    expect(getTrackingState({ status: 'COMPLETED', position: null, waitMinutes: null })).toBe('COMPLETED')
    expect(getTrackingState({ status: 'CANCELLED', position: null, waitMinutes: null })).toBe('CANCELLED')
    expect(getTrackingState({ status: 'NO_SHOW', position: null, waitMinutes: null })).toBe('CANCELLED')
  })
})
