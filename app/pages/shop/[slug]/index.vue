<script setup lang="ts">
import type { JoinQueueBody } from '#shared/schemas/queue'
import type { ServiceDto } from '#shared/types/dashboard'
import type { BookingDto } from '#shared/types/booking'
import type { QueueTrackingDto } from '#shared/types/queue'

definePageMeta({ layout: 'customer' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { shop, error: shopError, refresh: refreshShop } = await useShop(slug)
if (import.meta.server && shopError.value?.statusCode === 404) {
  setResponseStatus(useRequestEvent()!, 404)
}

const shopId = computed(() => shop.value?.id)
const { services } = await useServices(shopId)
const { queue, error: queueError, joining, join } = await usePublicQueue(shopId)

// The open/closed switch can change while the page is open.
usePolling(() => refreshShop(), 60_000)

useHead(() => ({ title: shop.value ? `${shop.value.name} · Join the queue` : 'Shop not found · Trimly' }))

const canJoin = computed(() => !!shop.value?.isOpen && !!queue.value?.soonestBarberId && !!services.value?.length)

// Join flow
const joinOpen = ref(false)
const selectedServiceId = ref<string | null>(null)
const joinError = ref<string | null>(null)
const existingPlaceUrl = ref<string | null>(null)

function openJoin(service?: ServiceDto) {
  if (!canJoin.value) {
    return
  }
  selectedServiceId.value = service?.id ?? selectedServiceId.value
  joinError.value = null
  existingPlaceUrl.value = null
  joinOpen.value = true
}

async function onJoin(body: JoinQueueBody) {
  joinError.value = null
  existingPlaceUrl.value = null

  const outcome = await join(body)
  if (outcome.ok) {
    rememberQueuePlace(slug.value, outcome.result.trackingCode)
    await navigateTo(`/queue/${outcome.result.trackingCode}`)
    return
  }

  joinError.value = outcome.code === 'ALREADY_IN_QUEUE'
    ? 'This phone number already has a place in the queue.'
    : outcome.message
  const remembered = recallQueuePlace(slug.value)
  if (outcome.code === 'ALREADY_IN_QUEUE' && remembered) {
    existingPlaceUrl.value = `/queue/${remembered}`
  }
}

// A place this device already holds in this shop's queue (client only).
const activePlace = ref<{ code: string, tracking: QueueTrackingDto } | null>(null)

onMounted(async () => {
  const code = recallQueuePlace(slug.value)
  if (!code) {
    return
  }
  try {
    const { data } = await $fetch<{ data: QueueTrackingDto }>(`/api/track/${code}`)
    if (data.state === 'COMPLETED' || data.state === 'CANCELLED') {
      forgetQueuePlace(slug.value)
    }
    else {
      activePlace.value = { code, tracking: data }
    }
  }
  catch {
    forgetQueuePlace(slug.value)
  }
})

// An upcoming booking this device made at this shop (client only).
const activeBooking = ref<{ code: string, booking: BookingDto } | null>(null)

onMounted(async () => {
  const code = recallBooking(slug.value)
  if (!code) {
    return
  }
  try {
    const { data } = await $fetch<{ data: BookingDto }>(`/api/bookings/${code}`)
    if (data.status === 'BOOKED' || data.status === 'CHECKED_IN') {
      activeBooking.value = { code, booking: data }
    }
    else {
      forgetBooking(slug.value)
    }
  }
  catch {
    forgetBooking(slug.value)
  }
})

const activeBookingTitle = computed(() => {
  const value = activeBooking.value
  if (!value) {
    return ''
  }
  const when = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: value.booking.shop.timezone
  }).format(new Date(value.booking.startsAt))
  return `Your appointment: ${when}`
})
</script>

<template>
  <!-- Unknown shop -->
  <div
    v-if="!shop"
    class="py-16 text-center"
  >
    <UIcon
      name="i-lucide-store"
      class="size-10 text-dimmed"
    />
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      {{ shopError?.statusCode === 404 ? 'Shop not found' : 'Couldn\'t load this shop' }}
    </h1>
    <p class="mt-2 text-muted">
      {{ shopError?.statusCode === 404 ? 'Check the link and try again.' : getApiErrorMessage(shopError) }}
    </p>
    <UButton
      v-if="shopError?.statusCode !== 404"
      label="Try again"
      color="neutral"
      variant="outline"
      class="mt-6"
      @click="refreshShop()"
    />
  </div>

  <div
    v-else
    class="space-y-5"
  >
    <!-- Header -->
    <header>
      <div class="flex items-start justify-between gap-3">
        <h1 class="text-3xl font-bold tracking-tight text-highlighted">
          {{ shop.name }}
        </h1>
        <UBadge
          :label="shop.isOpen ? 'Open' : 'Closed'"
          :color="shop.isOpen ? 'success' : 'neutral'"
          variant="subtle"
          size="lg"
          :icon="shop.isOpen ? 'i-lucide-circle-dot' : 'i-lucide-circle-slash'"
          class="mt-1 shrink-0"
        />
      </div>
      <p class="mt-1 text-muted">
        Join the queue now, or book a time that suits you.
      </p>
    </header>

    <!-- Already in the queue on this device -->
    <UAlert
      v-if="activePlace"
      color="primary"
      variant="subtle"
      icon="i-lucide-ticket"
      :title="activePlace.tracking.position ? `You're #${activePlace.tracking.position} in the queue` : 'You\'re in the queue'"
      description="Keep an eye on your live place in line."
      :actions="[{ label: 'View my place', color: 'primary', to: `/queue/${activePlace.code}` }]"
    />

    <!-- Upcoming booking on this device -->
    <UAlert
      v-if="activeBooking"
      color="neutral"
      variant="subtle"
      icon="i-lucide-calendar-check"
      :title="activeBookingTitle"
      :description="`${activeBooking.booking.serviceName} with ${activeBooking.booking.barberName}`"
      :actions="[{ label: 'View booking', color: 'neutral', variant: 'outline', to: `/booking/${activeBooking.code}` }]"
    />

    <!-- Live queue -->
    <ShopLiveStatus
      v-if="queue"
      :queue="queue"
      :time-zone="shop.timezone"
      :is-open="shop.isOpen"
    />
    <UAlert
      v-else-if="queueError"
      color="warning"
      variant="subtle"
      icon="i-lucide-wifi-off"
      title="Couldn't load the live queue"
      description="We'll keep trying in the background."
    />

    <!-- Services -->
    <section aria-labelledby="services-heading">
      <h2
        id="services-heading"
        class="mb-2 text-sm font-semibold uppercase tracking-widest text-muted"
      >
        Services
      </h2>
      <UCard
        v-if="services?.length"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <ul class="divide-y divide-default">
          <li
            v-for="service in services"
            :key="service.id"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors enabled:hover:bg-elevated/60 disabled:cursor-default"
              :disabled="!canJoin"
              @click="openJoin(service)"
            >
              <span>
                <span class="block font-medium text-highlighted">{{ service.name }}</span>
                <span class="block text-sm text-muted">{{ formatMinutes(service.durationMinutes) }}</span>
              </span>
              <span class="flex items-center gap-2">
                <span class="font-semibold tabular-nums text-highlighted">
                  {{ formatMoney(service.priceMinor, shop.currency) }}
                </span>
                <UIcon
                  v-if="canJoin"
                  name="i-lucide-chevron-right"
                  class="size-4 text-dimmed"
                />
              </span>
            </button>
          </li>
        </ul>
      </UCard>
      <p
        v-else
        class="text-sm text-muted"
      >
        No services are listed yet.
      </p>
    </section>

    <!-- Join: fixed to the bottom on phones, where thumbs are -->
    <div class="fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default/90 backdrop-blur">
      <div class="mx-auto grid w-full max-w-md grid-cols-2 gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <UButton
          :label="canJoin ? 'Join Queue' : (shop.isOpen ? 'Queue unavailable' : 'Queue closed')"
          :icon="canJoin ? 'i-lucide-user-plus' : undefined"
          size="xl"
          block
          :disabled="!canJoin"
          class="min-h-14 text-base font-semibold"
          @click="openJoin()"
        />
        <!-- Booking is for later times, so it doesn't depend on today's Open/Closed switch. -->
        <UButton
          :to="`/shop/${shop.slug}/book`"
          label="Book a time"
          icon="i-lucide-calendar-plus"
          color="neutral"
          variant="outline"
          size="xl"
          block
          :disabled="!services?.length"
          class="min-h-14 text-base font-semibold"
        />
      </div>
    </div>

    <JoinQueueDrawer
      v-if="queue && services"
      v-model:open="joinOpen"
      :shop-name="shop.name"
      :currency="shop.currency"
      :time-zone="shop.timezone"
      :services="services"
      :queue="queue"
      :initial-service-id="selectedServiceId"
      :submitting="joining"
      :error-message="joinError"
      :existing-place-url="existingPlaceUrl"
      @submit="onJoin"
    />
  </div>
</template>
