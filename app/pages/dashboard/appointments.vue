<script setup lang="ts">
import type { CreateAppointmentBody } from '#shared/schemas/appointment'
import type { AppointmentDto } from '#shared/types/appointment'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'shop'] })
useHead({ title: 'Appointments · Trimly' })

const VIEWS = ['today', 'calendar', 'upcoming', 'history'] as const
type View = (typeof VIEWS)[number]

const route = useRoute()
const { dashboard } = await useDashboard()

const timeZone = computed(() => dashboard.value?.shop.timezone ?? 'UTC')
const currency = computed(() => dashboard.value?.shop.currency ?? 'INR')
const barbers = computed(() => dashboard.value?.barbers ?? [])

// Ticks so "Late" badges appear without a reload.
const now = ref(new Date())
usePolling(() => {
  now.value = new Date()
}, 60_000)
const today = computed(() => localDateOf(now.value, timeZone.value))

function queryString(name: string, pattern: RegExp): string | null {
  const value = route.query[name]
  return typeof value === 'string' && pattern.test(value) ? value : null
}

// View, month, selected day and history window live in the URL.
const view = computed<View>(() => (VIEWS as readonly string[]).includes(route.query.view as string) ? route.query.view as View : 'today')
const month = computed(() => queryString('month', /^\d{4}-\d{2}$/) ?? today.value.slice(0, 7))
const selectedDate = computed(() =>
  queryString('date', /^\d{4}-\d{2}-\d{2}$/) ?? (today.value.startsWith(month.value) ? today.value : `${month.value}-01`)
)
const historyBefore = computed(() => queryString('before', /^\d{4}-\d{2}-\d{2}$/) ?? today.value)

function monthAfter(value: string, delta: number) {
  const [year, monthNumber] = value.split('-').map(Number)
  return new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1)).toISOString().slice(0, 7)
}

const range = computed(() => {
  switch (view.value) {
    case 'calendar':
      return { from: `${month.value}-01`, to: `${monthAfter(month.value, 1)}-01` }
    case 'upcoming':
      return { from: addLocalDays(today.value, 1), to: addLocalDays(today.value, 61) }
    case 'history':
      return { from: addLocalDays(historyBefore.value, -60), to: historyBefore.value }
    default:
      return { from: today.value, to: addLocalDays(today.value, 1) }
  }
})

const {
  appointments,
  status,
  error,
  refresh,
  pending,
  booking,
  book,
  checkIn,
  cancel,
  noShow
} = await useAppointments(range)

const { services } = await useServices(() => dashboard.value?.shop.id)

function go(query: Record<string, string | undefined>) {
  return navigateTo({ query: { ...route.query, ...query } }, { replace: true })
}

const tabs = [
  { label: 'Today', value: 'today' },
  { label: 'Calendar', value: 'calendar' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'History', value: 'history' }
]

const selectedTab = computed({
  get: () => view.value,
  set: value => navigateTo({ query: { view: value } }, { replace: true })
})

const all = computed(() => appointments.value ?? [])

const shown = computed<AppointmentDto[]>(() => {
  switch (view.value) {
    case 'calendar':
      return all.value.filter(item => localDateOf(new Date(item.startsAt), timeZone.value) === selectedDate.value)
    case 'upcoming':
      return all.value.filter(item => item.status === 'BOOKED')
    case 'history':
      return [...all.value].reverse()
    default:
      return all.value
  }
})

const calendarCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const item of all.value) {
    if (item.status === 'BOOKED' || item.status === 'CHECKED_IN') {
      const date = localDateOf(new Date(item.startsAt), timeZone.value)
      counts[date] = (counts[date] ?? 0) + 1
    }
  }
  return counts
})

const emptyText = computed(() => ({
  today: 'No appointments today.',
  calendar: 'No appointments on this day.',
  upcoming: 'No upcoming appointments in the next 60 days.',
  history: 'No appointments in this period.'
})[view.value])

const isLoading = computed(() => status.value === 'pending')

// Booking
const bookOpen = ref(false)
const bookDate = computed(() => (view.value === 'calendar' ? selectedDate.value : today.value))

async function onBook(body: CreateAppointmentBody) {
  if (await book(body)) {
    bookOpen.value = false
  }
}

// Cancel and no-show can't be undone, so they are confirmed first.
const confirming = ref<{ action: 'cancel' | 'no-show', appointment: AppointmentDto } | null>(null)
const confirmOpen = computed({
  get: () => confirming.value !== null,
  set: (value) => {
    if (!value) {
      confirming.value = null
    }
  }
})
const confirmCopy = computed(() => {
  const target = confirming.value
  if (!target) {
    return { title: '', description: '', label: '' }
  }
  const who = `${target.appointment.customer.name} at ${formatTime(target.appointment.startsAt, timeZone.value)}`
  return target.action === 'cancel'
    ? { title: `Cancel ${who}?`, description: 'The time becomes free for other bookings.', label: 'Cancel appointment' }
    : { title: `Mark ${who} as no-show?`, description: 'Use this when the customer didn\'t turn up.', label: 'Mark no-show' }
})

async function onConfirm() {
  const target = confirming.value
  if (!target) {
    return
  }
  await (target.action === 'cancel' ? cancel(target.appointment.id) : noShow(target.appointment.id))
  confirming.value = null
}
</script>

<template>
  <UContainer class="space-y-6 py-6 sm:py-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
        Appointments
      </h1>
      <UButton
        label="Book appointment"
        icon="i-lucide-calendar-plus"
        size="lg"
        :disabled="!services?.length"
        @click="bookOpen = true"
      />
    </header>

    <UTabs
      v-model="selectedTab"
      :items="tabs"
      :content="false"
      class="w-full"
    />

    <UAlert
      v-if="error && !appointments"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load appointments"
      :description="getApiErrorMessage(error)"
      :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <div
      v-else
      class="grid items-start gap-6"
      :class="view === 'calendar' ? 'lg:grid-cols-5' : ''"
    >
      <UCard
        v-if="view === 'calendar'"
        class="lg:col-span-2"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <AppointmentCalendar
          :month="month"
          :today="today"
          :selected="selectedDate"
          :counts="calendarCounts"
          @select="date => go({ date })"
          @month="delta => go({ month: monthAfter(month, delta), date: undefined })"
        />
      </UCard>

      <UCard
        :class="view === 'calendar' ? 'lg:col-span-3' : ''"
        :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-5' }"
      >
        <template
          v-if="view === 'calendar' || view === 'history'"
          #header
        >
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-highlighted">
              <template v-if="view === 'calendar'">
                {{ formatReportPeriod('day', selectedDate, addLocalDays(selectedDate, 1)) }}
              </template>
              <template v-else>
                {{ formatReportPeriod('day', range.from, range.to) }} – {{ formatReportPeriod('day', addLocalDays(range.to, -1), range.to) }}
              </template>
            </h2>
            <UButton
              v-if="view === 'history'"
              label="Earlier"
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="go({ before: range.from })"
            />
          </div>
        </template>

        <div
          v-if="isLoading && !appointments"
          class="space-y-3 p-4"
        >
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-16"
          />
        </div>
        <AppointmentList
          v-else
          :class="isLoading ? 'opacity-60' : ''"
          :appointments="shown"
          :time-zone="timeZone"
          :currency="currency"
          :now="now"
          :pending="pending"
          :show-dates="view === 'upcoming' || view === 'history'"
          :show-barber="barbers.length > 1"
          :empty-text="emptyText"
          @check-in="appointment => checkIn(appointment.id)"
          @cancel="appointment => (confirming = { action: 'cancel', appointment })"
          @no-show="appointment => (confirming = { action: 'no-show', appointment })"
        />
      </UCard>
    </div>

    <BookAppointmentModal
      v-if="services"
      v-model:open="bookOpen"
      :services="services"
      :barbers="barbers"
      :currency="currency"
      :time-zone="timeZone"
      :initial-date="bookDate"
      :submitting="booking"
      @submit="onBook"
    />

    <ConfirmModal
      v-model:open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.label"
      :loading="pending !== null"
      @confirm="onConfirm"
    />
  </UContainer>
</template>
