<script setup lang="ts">
// The signed-in member's shop, as the server returned it.
import type { MemberRole } from '#shared/constants'
import type { ShopProfileDto } from '#shared/types/shop'

const props = defineProps<{
  shop: ShopProfileDto
  ownerName: string | null
  memberRole: MemberRole
}>()

const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Owner',
  BARBER: 'Barber',
  RECEPTIONIST: 'Receptionist'
}

const toast = useToast()
const customerLink = computed(() => `${useRequestURL().origin}/shop/${props.shop.slug}`)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(customerLink.value)
    toast.add({ title: 'Link copied', description: 'Share it so customers can join your queue.', color: 'success', icon: 'i-lucide-check' })
  }
  catch {
    toast.add({ title: 'Couldn\'t copy', description: customerLink.value, color: 'neutral', icon: 'i-lucide-link' })
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <h2 class="truncate font-semibold text-highlighted">
            {{ shop.name }}
          </h2>
          <p class="text-sm text-muted">
            Your role: {{ ROLE_LABELS[memberRole] }}
          </p>
        </div>
        <UBadge
          :label="shop.isOpen ? 'Open online' : 'Closed online'"
          :color="shop.isOpen ? 'success' : 'error'"
          variant="subtle"
        />
      </div>
    </template>

    <dl class="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
      <div>
        <dt class="text-muted">
          Owner
        </dt>
        <dd class="font-medium text-highlighted">
          {{ ownerName ?? '—' }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Phone
        </dt>
        <dd class="font-medium text-highlighted">
          <a
            v-if="shop.phone"
            :href="`tel:${shop.phone}`"
            class="underline-offset-2 hover:underline"
          >{{ formatIndianMobile(shop.phone) }}</a>
          <span v-else>—</span>
        </dd>
      </div>
      <div class="sm:col-span-2">
        <dt class="text-muted">
          Address
        </dt>
        <dd class="whitespace-pre-line font-medium text-highlighted">
          {{ shop.address || '—' }}
        </dd>
      </div>
      <div class="sm:col-span-2">
        <dt class="text-muted">
          Customer link
        </dt>
        <dd class="flex items-center gap-2">
          <NuxtLink
            :to="`/shop/${shop.slug}`"
            target="_blank"
            class="min-w-0 truncate font-medium text-highlighted underline-offset-2 hover:underline"
          >
            {{ customerLink }}
          </NuxtLink>
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Copy customer link"
            @click="copyLink"
          />
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Currency
        </dt>
        <dd class="font-medium text-highlighted">
          {{ shop.currency }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Timezone
        </dt>
        <dd class="font-medium text-highlighted">
          {{ shop.timezone }}
        </dd>
      </div>
    </dl>
  </UCard>
</template>
