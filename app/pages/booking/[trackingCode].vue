<script setup lang="ts">
definePageMeta({ layout: 'customer' })

const route = useRoute()
// The code is the customer's private link to their booking.
const trackingCode = computed(() => String(route.params.trackingCode))

const { booking, error, refresh, cancelling, cancel } = await useBooking(trackingCode)

if (import.meta.server && error.value?.statusCode === 404) {
  setResponseStatus(useRequestEvent()!, 404)
}

useHead(() => ({ title: booking.value ? `Your appointment · ${booking.value.shop.name}` : 'Your appointment · Trimly' }))

const when = computed(() => {
  const value = booking.value
  if (!value) {
    return { day: '', time: '' }
  }
  const timeZone = value.shop.timezone
  return {
    day: new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(new Date(value.startsAt)),
    time: formatTimeRange(value.startsAt, value.endsAt, timeZone)
  }
})

// Booked, but the time has come and the barber hasn't checked them in yet.
const isDue = computed(() => booking.value?.status === 'BOOKED' && !booking.value.canCancel)

const look = computed(() => {
  switch (booking.value?.status) {
    case 'CHECKED_IN':
      return { card: 'bg-primary text-inverted', muted: 'text-inverted/80', icon: 'i-lucide-circle-check', eyebrow: 'Checked in' }
    case 'CANCELLED':
      return { card: 'bg-elevated ring-1 ring-default', muted: 'text-muted', icon: 'i-lucide-calendar-x', eyebrow: 'Cancelled' }
    case 'NO_SHOW':
      return { card: 'bg-elevated ring-1 ring-default', muted: 'text-muted', icon: 'i-lucide-user-x', eyebrow: 'Missed' }
    default:
      return isDue.value
        ? { card: 'bg-warning/10 ring-1 ring-warning/30', muted: 'text-muted', icon: 'i-lucide-footprints', eyebrow: 'It\'s time' }
        : { card: 'bg-default ring-1 ring-default', muted: 'text-muted', icon: 'i-lucide-calendar-check', eyebrow: 'You\'re booked' }
  }
})

// Once the visit is over, stop pointing the shop page here.
watch(
  () => booking.value?.status,
  (status) => {
    if (import.meta.client && booking.value && (status === 'CANCELLED' || status === 'NO_SHOW')) {
      forgetBooking(booking.value.shop.slug)
    }
  },
  { immediate: true }
)

const confirmCancel = ref(false)
async function onCancel() {
  await cancel()
  confirmCancel.value = false
}
</script>

<template>
  <div
    v-if="!booking"
    class="py-16 text-center"
  >
    <UIcon
      name="i-lucide-calendar-x"
      class="size-10 text-dimmed"
    />
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      {{ error?.statusCode === 404 ? 'We couldn\'t find this booking' : 'Couldn\'t load your booking' }}
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
      @click="refresh()"
    />
  </div>

  <div
    v-else
    class="space-y-5"
  >
    <NuxtLink
      :to="`/shop/${booking.shop.slug}`"
      class="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-highlighted"
    >
      <UIcon
        name="i-lucide-store"
        class="size-4"
      />
      {{ booking.shop.name }}
    </NuxtLink>

    <section
      class="rounded-2xl p-6 shadow-sm"
      :class="look.card"
      aria-live="polite"
    >
      <p
        class="flex items-center gap-2 text-sm font-semibold"
        :class="booking.status === 'CHECKED_IN' ? 'text-inverted' : look.muted"
      >
        <UIcon
          :name="look.icon"
          class="size-4"
        />
        {{ look.eyebrow }}
      </p>

      <template v-if="booking.status === 'CHECKED_IN'">
        <h1 class="mt-3 text-4xl font-bold tracking-tight">
          You're in the queue
        </h1>
        <p
          class="mt-2 text-lg"
          :class="look.muted"
        >
          See your live place in line and when you'll be called.
        </p>
      </template>
      <template v-else-if="booking.status === 'CANCELLED' || booking.status === 'NO_SHOW'">
        <h1 class="mt-3 text-4xl font-bold tracking-tight text-highlighted">
          {{ booking.status === 'CANCELLED' ? 'Appointment cancelled' : 'We missed you' }}
        </h1>
        <p class="mt-2 text-lg text-muted">
          {{ when.day }}, {{ when.time }}
        </p>
      </template>
      <template v-else>
        <h1 class="mt-3 text-4xl font-bold tracking-tight text-highlighted">
          {{ when.time }}
        </h1>
        <p class="mt-1 text-lg text-highlighted">
          {{ when.day }}
        </p>
        <p class="mt-3 text-muted">
          {{ isDue
            ? 'Please head to the shop. The barber will check you in when you arrive.'
            : 'Arrive a few minutes early. The barber checks you in when you arrive.' }}
        </p>
      </template>
    </section>

    <UButton
      v-if="booking.status === 'CHECKED_IN' && booking.queueTrackingCode"
      :to="`/queue/${booking.queueTrackingCode}`"
      label="See my place in the queue"
      trailing-icon="i-lucide-arrow-right"
      size="xl"
      block
      class="min-h-14 text-base font-semibold"
    />

    <UCard :ui="{ body: 'p-5' }">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt class="text-muted">
            Name
          </dt>
          <dd class="font-medium text-highlighted">
            {{ booking.customerName }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Barber
          </dt>
          <dd class="font-medium text-highlighted">
            {{ booking.barberName }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Service
          </dt>
          <dd class="font-medium text-highlighted">
            {{ booking.serviceName }} · {{ formatMinutes(booking.durationMinutes) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Price
          </dt>
          <dd class="font-medium tabular-nums text-highlighted">
            {{ formatMoney(booking.priceMinor, booking.shop.currency) }}
          </dd>
        </div>
      </dl>
    </UCard>

    <p
      v-if="booking.status === 'BOOKED'"
      class="text-center text-xs text-dimmed"
    >
      Keep this link to see or cancel your appointment.
    </p>

    <UButton
      v-if="booking.canCancel"
      label="Cancel appointment"
      color="error"
      variant="ghost"
      block
      @click="confirmCancel = true"
    />

    <UButton
      v-if="booking.status === 'CANCELLED' || booking.status === 'NO_SHOW'"
      :to="`/shop/${booking.shop.slug}/book`"
      label="Book again"
      icon="i-lucide-calendar-plus"
      size="xl"
      block
      class="min-h-14 text-base font-semibold"
    />

    <ConfirmModal
      v-model:open="confirmCancel"
      title="Cancel your appointment?"
      :description="`${when.day}, ${when.time}. The time will be offered to others.`"
      confirm-label="Cancel appointment"
      :loading="cancelling"
      @confirm="onCancel"
    />
  </div>
</template>
