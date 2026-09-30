<script setup lang="ts">
import { z } from 'zod'
import { phoneSchema } from '#shared/schemas/queue'
import type { ApiSuccess, ShopQueueDto } from '#shared/types/queue'

definePageMeta({ layout: 'customer' })

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { shop, error: shopError } = await useShop(slug)
if (import.meta.server && shopError.value?.statusCode === 404) {
  setResponseStatus(useRequestEvent()!, 404)
}
const shopId = computed(() => shop.value?.id)
const { services } = await useServices(shopId)

useHead(() => ({ title: shop.value ? `Book · ${shop.value.name}` : 'Shop not found · Trimly' }))

// Barbers, for the optional barber choice (from the public queue, once).
const { data: barbers } = await useAsyncData(
  () => `book-barbers:${shopId.value ?? ''}`,
  async () => {
    if (!shopId.value) {
      return []
    }
    const { data } = await $fetch<ApiSuccess<ShopQueueDto>>(`/api/shops/${shopId.value}/queue`)
    return data.barbers.filter(lane => lane.barber.isActive).map(lane => lane.barber)
  }
)

const ANY_BARBER = 'any'
const serviceId = ref<string | undefined>(
  typeof route.query.service === 'string' ? route.query.service : services.value?.[0]?.id
)
const barberChoice = ref(ANY_BARBER)
const barberId = computed(() => (barberChoice.value === ANY_BARBER ? null : barberChoice.value))

const { availability, status: availabilityStatus, error: availabilityError, refresh, booking, book } = useAvailability(shopId, serviceId, barberId)

const selectedDate = ref<string | null>(null)
const selectedSlot = ref<string | null>(null)

// A different service or barber means different times.
watch([serviceId, barberChoice], () => {
  selectedSlot.value = null
})

const days = computed(() => availability.value?.days ?? [])
const timeZone = computed(() => availability.value?.timeZone ?? shop.value?.timezone ?? 'UTC')

// Start on the first day with a free time.
watch(days, (value) => {
  const current = value.find(day => day.date === selectedDate.value)
  if (!current || current.slots.length === 0) {
    selectedDate.value = value.find(day => day.slots.length > 0)?.date ?? value[0]?.date ?? null
  }
}, { immediate: true })

const selectedDay = computed(() => days.value.find(day => day.date === selectedDate.value) ?? null)

function dayLabel(date: string, index: number) {
  if (index === 0) {
    return 'Today'
  }
  if (index === 1) {
    return 'Tomorrow'
  }
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

function dayNumber(date: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

const slotGroups = computed(() => {
  const groups = [
    { label: 'Morning', slots: [] as string[] },
    { label: 'Afternoon', slots: [] as string[] },
    { label: 'Evening', slots: [] as string[] }
  ]
  for (const slot of selectedDay.value?.slots ?? []) {
    const hour = Number(localTimeOf(new Date(slot.startsAt), timeZone.value).slice(0, 2))
    groups[hour < 12 ? 0 : hour < 17 ? 1 : 2]!.slots.push(slot.startsAt)
  }
  return groups.filter(group => group.slots.length > 0)
})

const selectedService = computed(() => services.value?.find(service => service.id === serviceId.value) ?? null)

const serviceItems = computed(() =>
  (services.value ?? []).map(service => ({
    label: service.name,
    description: `${formatMinutes(service.durationMinutes)} · ${formatMoney(service.priceMinor, shop.value?.currency ?? 'INR')}`,
    value: service.id
  }))
)

const barberItems = computed(() => [
  { label: 'Any barber', value: ANY_BARBER },
  ...(barbers.value ?? []).map(barber => ({ label: barber.name, value: barber.id }))
])

// Details
const name = ref('')
const phone = ref('')
const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  phone: phoneSchema
})
const fieldErrors = ref<{ name?: string, phone?: string }>({})
const bookingError = ref<string | null>(null)
const existingBookingUrl = ref<string | null>(null)

const summary = computed(() => {
  if (!selectedSlot.value || !selectedService.value || !shop.value) {
    return null
  }
  const when = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone.value
  }).format(new Date(selectedSlot.value))
  return `${when} · ${selectedService.value.name} · ${formatMoney(selectedService.value.priceMinor, shop.value.currency)}`
})

async function onBook() {
  bookingError.value = null
  existingBookingUrl.value = null
  const details = detailsSchema.safeParse({ name: name.value, phone: phone.value })
  fieldErrors.value = details.success
    ? {}
    : Object.fromEntries(details.error.issues.map(issue => [issue.path[0], issue.message]))
  if (!details.success || !selectedSlot.value || !serviceId.value) {
    return
  }

  const outcome = await book({
    customer: details.data,
    serviceId: serviceId.value,
    barberId: barberId.value,
    startsAt: selectedSlot.value
  })

  if (outcome.ok) {
    rememberBooking(slug.value, outcome.result.trackingCode)
    await navigateTo(`/booking/${outcome.result.trackingCode}`)
    return
  }

  if (outcome.code === 'SLOT_UNAVAILABLE' || outcome.code === 'SLOT_TAKEN') {
    bookingError.value = 'Sorry, that time was just taken. Please pick another.'
    selectedSlot.value = null
    await refresh()
    return
  }
  if (outcome.code === 'ALREADY_BOOKED') {
    bookingError.value = 'This phone number already has an upcoming appointment here.'
    const remembered = recallBooking(slug.value)
    existingBookingUrl.value = remembered ? `/booking/${remembered}` : null
    return
  }
  bookingError.value = outcome.message
}
</script>

<template>
  <div
    v-if="!shop"
    class="py-16 text-center"
  >
    <UIcon
      name="i-lucide-store"
      class="size-10 text-dimmed"
    />
    <h1 class="mt-4 text-xl font-semibold text-highlighted">
      Shop not found
    </h1>
    <p class="mt-2 text-muted">
      Check the link and try again.
    </p>
  </div>

  <div
    v-else
    class="space-y-6"
  >
    <header>
      <NuxtLink
        :to="`/shop/${shop.slug}`"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-highlighted"
      >
        <UIcon
          name="i-lucide-arrow-left"
          class="size-4"
        />
        {{ shop.name }}
      </NuxtLink>
      <h1 class="mt-2 text-3xl font-bold tracking-tight text-highlighted">
        Book a time
      </h1>
      <p class="mt-1 text-muted">
        Pick a service and a time. No account needed.
      </p>
    </header>

    <!-- 1. Service -->
    <section class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-widest text-muted">
        Service
      </h2>
      <URadioGroup
        v-model="serviceId"
        :items="serviceItems"
        variant="card"
        indicator="hidden"
        :ui="{ fieldset: 'grid gap-2' }"
      />
      <USelect
        v-if="(barbers?.length ?? 0) > 1"
        v-model="barberChoice"
        :items="barberItems"
        size="lg"
        class="w-full"
        aria-label="Barber"
      />
    </section>

    <!-- 2. Day -->
    <section class="space-y-2">
      <h2 class="text-sm font-semibold uppercase tracking-widest text-muted">
        Day
      </h2>
      <div
        v-if="availabilityStatus === 'pending' && !availability"
        class="flex gap-2 overflow-hidden"
      >
        <USkeleton
          v-for="n in 5"
          :key="n"
          class="h-20 w-18 shrink-0 rounded-lg"
        />
      </div>
      <UAlert
        v-else-if="availabilityError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Couldn't load available times"
        :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />
      <div
        v-else
        class="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1"
      >
        <button
          v-for="(day, index) in days"
          :key="day.date"
          type="button"
          class="flex w-20 shrink-0 snap-start flex-col items-center rounded-lg border px-2 py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :class="day.date === selectedDate
            ? 'border-inverted bg-inverted text-inverted'
            : 'border-default bg-default hover:bg-elevated'"
          :disabled="day.slots.length === 0"
          :aria-pressed="day.date === selectedDate"
          @click="selectedDate = day.date; selectedSlot = null"
        >
          <span class="text-xs font-medium">{{ dayLabel(day.date, index) }}</span>
          <span class="text-sm font-semibold">{{ dayNumber(day.date) }}</span>
          <span
            class="mt-0.5 text-[11px]"
            :class="day.date === selectedDate ? 'text-inverted/80' : 'text-muted'"
          >{{ !day.isOpen ? 'Closed' : day.slots.length === 0 ? 'Full' : `${day.slots.length} free` }}</span>
        </button>
      </div>
    </section>

    <!-- 3. Time -->
    <section
      v-if="selectedDay"
      class="space-y-3"
    >
      <h2 class="text-sm font-semibold uppercase tracking-widest text-muted">
        Time
      </h2>
      <p
        v-if="!slotGroups.length"
        class="text-sm text-muted"
      >
        No free times this day.
      </p>
      <div
        v-for="group in slotGroups"
        :key="group.label"
      >
        <p class="mb-1.5 text-xs font-medium text-muted">
          {{ group.label }}
        </p>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="slot in group.slots"
            :key="slot"
            type="button"
            class="rounded-lg border py-2.5 text-sm font-medium tabular-nums transition-colors"
            :class="slot === selectedSlot
              ? 'border-inverted bg-inverted text-inverted'
              : 'border-default bg-default text-highlighted hover:bg-elevated'"
            :aria-pressed="slot === selectedSlot"
            @click="selectedSlot = slot"
          >
            {{ formatTime(slot, timeZone) }}
          </button>
        </div>
      </div>
    </section>

    <!-- 4. Details -->
    <section
      v-if="selectedSlot"
      class="space-y-4"
    >
      <h2 class="text-sm font-semibold uppercase tracking-widest text-muted">
        Your details
      </h2>
      <UFormField
        label="Your name"
        :error="fieldErrors.name"
        required
      >
        <UInput
          v-model="name"
          autocomplete="name"
          size="xl"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Phone"
        help="Include your country code."
        :error="fieldErrors.phone"
        required
      >
        <UInput
          v-model="phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="+91 98765 43210"
          size="xl"
          class="w-full"
        />
      </UFormField>
    </section>

    <UAlert
      v-if="bookingError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="bookingError"
      :actions="existingBookingUrl ? [{ label: 'View my booking', color: 'error', variant: 'outline', to: existingBookingUrl }] : undefined"
    />

    <!-- Summary and booking, where thumbs are -->
    <div class="fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default/90 backdrop-blur">
      <div class="mx-auto w-full max-w-md space-y-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p
          v-if="summary"
          class="truncate text-center text-sm text-muted"
        >
          {{ summary }}
        </p>
        <UButton
          :label="selectedSlot ? 'Book appointment' : 'Pick a time'"
          icon="i-lucide-calendar-check"
          size="xl"
          block
          :loading="booking"
          :disabled="!selectedSlot"
          class="min-h-14 text-base font-semibold"
          @click="onBook"
        />
      </div>
    </div>
  </div>
</template>
