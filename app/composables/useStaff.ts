// The shop's staff for the owner: list (refreshed while open), add, rename,
// deactivate and reactivate. Everything is checked again on the server.
import type { CreateStaffBody } from '#shared/schemas/staff'
import type { ApiSuccess } from '#shared/types/queue'
import type { StaffMemberDto } from '#shared/types/staff'

export async function useStaff() {
  const toast = useToast()
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData('staff', async () => (await requestFetch<ApiSuccess<StaffMemberDto[]>>('/api/shop/staff')).data)
  const { data, error, refresh } = asyncData
  // Who's serving and how many are waiting changes as the queue moves.
  usePolling(refresh, 15_000)

  const saving = ref(false)
  /** The barber whose activation change is in flight. */
  const updating = ref<string | null>(null)

  async function add(input: CreateStaffBody): Promise<boolean> {
    saving.value = true
    try {
      const { data: added } = await $fetch<ApiSuccess<StaffMemberDto>>('/api/shop/staff', { method: 'POST', body: input })
      toast.add(added.account.status === 'LINKED'
        ? { title: `${added.name} added`, description: 'They can sign in and see the queue now.', color: 'success', icon: 'i-lucide-user-check' }
        : { title: `${added.name} added`, description: 'They\'ll get access when they sign in to Trimly with their mobile number.', color: 'success', icon: 'i-lucide-user-plus' })
      await refresh()
      return true
    }
    catch (caught) {
      toast.add({ title: 'Could not add barber', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
    finally {
      saving.value = false
    }
  }

  async function update(member: StaffMemberDto, body: { name?: string, isActive?: boolean }): Promise<boolean> {
    updating.value = member.id
    try {
      await $fetch(`/api/shop/staff/${member.id}`, { method: 'PATCH', body })
      if (body.isActive !== undefined) {
        toast.add(body.isActive
          ? { title: `${member.name} is active again`, color: 'success', icon: 'i-lucide-user-check' }
          : { title: `${member.name} deactivated`, description: 'No new customers; their dashboard access is removed.', color: 'neutral', icon: 'i-lucide-user-x' })
      }
      await refresh()
      return true
    }
    catch (caught) {
      toast.add({ title: 'Could not update', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
    finally {
      updating.value = null
    }
  }

  await asyncData
  return { staff: data, error, refresh, saving, updating, add, update }
}
