// The owner's services: list, add, edit, archive/restore.
import type { CreateServiceBody, UpdateServiceBody } from '#shared/schemas/service'
import type { ManagedServiceDto } from '#shared/types/dashboard'
import type { ApiSuccess } from '#shared/types/queue'

export async function useManagedServices() {
  const toast = useToast()
  const requestFetch = useRequestFetch()

  const asyncData = useAsyncData(
    'managed-services',
    async () => (await requestFetch<ApiSuccess<ManagedServiceDto[]>>('/api/dashboard/services')).data
  )
  const { data, status, error, refresh } = asyncData
  const saving = ref(false)
  /** The service whose archive/restore is in flight. */
  const toggling = ref<string | null>(null)

  async function save(input: CreateServiceBody, id?: string): Promise<boolean> {
    saving.value = true
    try {
      if (id) {
        await $fetch(`/api/dashboard/services/${id}`, { method: 'PATCH', body: input })
      }
      else {
        await $fetch('/api/dashboard/services', { method: 'POST', body: input })
      }
      toast.add({ title: id ? 'Service updated' : `${input.name} added`, color: 'success', icon: 'i-lucide-check' })
      await refresh()
      return true
    }
    catch (caught) {
      toast.add({ title: 'Could not save', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
    finally {
      saving.value = false
    }
  }

  async function setActive(service: ManagedServiceDto, isActive: boolean) {
    toggling.value = service.id
    try {
      const body: UpdateServiceBody = { isActive }
      await $fetch(`/api/dashboard/services/${service.id}`, { method: 'PATCH', body })
      toast.add({
        title: isActive ? `${service.name} is back on the menu` : `${service.name} archived`,
        description: isActive ? undefined : 'Customers can no longer choose it. Past visits keep it.',
        color: 'neutral',
        icon: isActive ? 'i-lucide-rotate-ccw' : 'i-lucide-archive'
      })
      await refresh()
    }
    catch (caught) {
      toast.add({ title: 'Could not update', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
    }
    finally {
      toggling.value = null
    }
  }

  await asyncData
  return { services: data, status, error, refresh, saving, toggling, save, setActive }
}
