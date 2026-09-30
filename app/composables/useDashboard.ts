import type { ApiSuccess } from '#shared/types/queue'
import type { ShopProfileDto } from '#shared/types/shop'

/** The signed-in owner's shop and today's numbers. Await it so the first render has them. */
export async function useDashboard() {
  const toast = useToast()

  const fetched = useFetch('/api/dashboard', {
    key: 'dashboard',
    transform: response => response.data
  })
  const { data, status, error, refresh } = fetched

  const updatingOpen = ref(false)

  /** Opens or closes the shop to online joins. */
  async function setOpen(isOpen: boolean) {
    updatingOpen.value = true
    try {
      const { data: shop } = await $fetch<ApiSuccess<ShopProfileDto>>('/api/dashboard/shop', {
        method: 'PATCH',
        body: { isOpen }
      })
      if (data.value) {
        data.value = { ...data.value, shop }
      }
      toast.add({
        title: shop.isOpen ? 'Shop is open' : 'Shop is closed',
        description: shop.isOpen ? 'Customers can join online.' : 'Online joining is paused. You can still add walk-ins.',
        color: shop.isOpen ? 'success' : 'neutral',
        icon: shop.isOpen ? 'i-lucide-door-open' : 'i-lucide-door-closed'
      })
    }
    catch (caught) {
      toast.add({ title: 'Could not update', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
    }
    finally {
      updatingOpen.value = false
    }
  }

  await fetched
  return { dashboard: data, status, error, refresh, updatingOpen, setOpen }
}
