import type { MemberRole } from '../constants'

/** A barber on the shop's staff, as the owner sees them. */
export interface StaffMemberDto {
  /** The barber (chair) id. */
  id: string
  name: string
  isActive: boolean
  /** Their role in the shop; null until their account is linked. */
  role: MemberRole | null
  account: {
    /** LINKED: they can sign in and use the dashboard. INVITED: waiting for them to verify `invitePhone`. */
    status: 'LINKED' | 'INVITED'
    name: string | null
    email: string | null
    phoneNumber: string | null
  }
  /** The mobile number they were added with (E.164). */
  invitePhone: string | null
  /** SERVING: with a customer now. AVAILABLE: free. INACTIVE: not taking customers. */
  status: 'SERVING' | 'AVAILABLE' | 'INACTIVE'
  /** Customers waiting for them now. */
  waiting: number
}
