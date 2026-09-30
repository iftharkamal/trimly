<script setup lang="ts">
definePageMeta({ layout: 'customer' })

const route = useRoute()
// The tracking code is the customer's secret link to their place.
const trackingCode = computed(() => String(route.params.trackingCode))

const { tracking, error, refresh, leaving, leave } = await useQueueTracking(trackingCode)

if (import.meta.server && error.value?.statusCode === 404) {
  setResponseStatus(useRequestEvent()!, 404)
}

useHead(() => {
  const value = tracking.value
  if (!value) {
    return { title: 'Your place · Trimly' }
  }
  const prefix = value.state === 'YOU_ARE_NEXT'
    ? 'You\'re next'
    : value.position ? `#${value.position} in line` : 'Your place'
  return { title: `${prefix} · ${value.shop.name}` }
})

const isActive = computed(() =>
  !!tracking.value && ['WAITING', 'GETTING_CLOSE', 'YOU_ARE_NEXT', 'IN_PROGRESS'].includes(tracking.value.state)
)

// Once the visit is over, stop pointing the shop page back here.
watch(
  () => tracking.value?.state,
  (state) => {
    if (import.meta.client && tracking.value && (state === 'COMPLETED' || state === 'CANCELLED')) {
      forgetQueuePlace(tracking.value.shop.slug)
    }
  },
  { immediate: true }
)

const refreshing = ref(false)
async function refreshNow() {
  refreshing.value = true
  await refresh()
  refreshing.value = false
}

const confirmLeave = ref(false)
async function onLeave() {
  await leave()
  confirmLeave.value = false
}
</script>

<template>
  <!-- Not found / failed to load -->
  <div
    v-if="!tracking"
    class="py-16 text-center"
  >
    <UIcon
      name="i-lucide-ticket-x"
      class="size-10 text-dimmed"
    />
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      {{ error?.statusCode === 404 ? 'We couldn\'t find this place in the queue' : 'Couldn\'t load your place' }}
    </h1>
    <p class="mt-2 text-muted">
      {{ error?.statusCode === 404 ? 'The link may be incomplete. Check it and try again.' : getApiErrorMessage(error) }}
    </p>
    <UButton
      v-if="error?.statusCode !== 404"
      label="Try again"
      color="neutral"
      variant="outline"
      class="mt-6"
      :loading="refreshing"
      @click="refreshNow"
    />
  </div>

  <div
    v-else
    class="space-y-5"
  >
    <NuxtLink
      :to="`/shop/${tracking.shop.slug}`"
      class="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-store"
        class="size-4"
      />
      {{ tracking.shop.name }}
    </NuxtLink>

    <QueueStatusHero :tracking="tracking" />

    <UCard
      v-if="isActive"
      :ui="{ body: 'p-5' }"
    >
      <QueueProgress
        :state="tracking.state"
        :position="tracking.position"
        :customers-ahead="tracking.customersAhead"
      />
    </UCard>

    <!-- Booking details -->
    <UCard :ui="{ body: 'p-5' }">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-muted">
            Name
          </dt>
          <dd class="font-medium text-highlighted">
            {{ tracking.customerName }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Barber
          </dt>
          <dd class="font-medium text-highlighted">
            {{ tracking.barberName }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Service
          </dt>
          <dd class="font-medium text-highlighted">
            {{ tracking.serviceName }} · {{ formatMinutes(tracking.durationMinutes) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Price
          </dt>
          <dd class="font-medium tabular-nums text-highlighted">
            {{ formatMoney(tracking.priceMinor, tracking.shop.currency) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Joined
          </dt>
          <dd class="font-medium tabular-nums text-highlighted">
            {{ formatTime(tracking.joinedAt, tracking.shop.timezone) }}
          </dd>
        </div>
      </dl>
    </UCard>

    <!-- Live refresh / actions -->
    <div
      v-if="isActive"
      class="flex items-center justify-between gap-3 text-sm text-muted"
    >
      <span class="inline-flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-success" />
        Live · updated {{ formatTime(tracking.calculatedAt, tracking.shop.timezone) }}
      </span>
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        :loading="refreshing"
        @click="refreshNow"
      />
    </div>

    <UButton
      v-if="tracking.status === 'WAITING'"
      label="Leave the queue"
      color="error"
      variant="ghost"
      block
      @click="confirmLeave = true"
    />

    <UButton
      v-if="!isActive"
      :to="`/shop/${tracking.shop.slug}`"
      label="Join again"
      icon="i-lucide-user-plus"
      size="xl"
      block
      class="min-h-14 text-base font-semibold"
    />

    <ConfirmModal
      v-model:open="confirmLeave"
      title="Leave the queue?"
      description="You'll lose your place. If you change your mind, you'll join again at the end."
      confirm-label="Leave queue"
      :loading="leaving"
      @confirm="onLeave"
    />
  </div>
</template>
