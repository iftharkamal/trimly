<script setup lang="ts">
import type { JoinQueueBody } from '#shared/schemas/queue'
import type { PaymentMethod } from '#shared/constants'
import type { PaymentInput } from '#shared/schemas/payment'
import type { QueueEntryDto, WaitingEntryDto } from '#shared/types/queue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'shop'] })
useHead({ title: 'Live queue · Trimly' })

const {
  dashboard,
  status: dashboardStatus,
  error: dashboardError,
  refresh: refreshDashboard,
  updatingOpen,
  setOpen
} = await useDashboard()

const shopId = computed(() => dashboard.value?.shop.id)
const timeZone = computed(() => dashboard.value?.shop.timezone ?? 'UTC')

const {
  queue,
  status: queueStatus,
  error: queueError,
  refresh: refreshQueue,
  pending,
  adding,
  start,
  complete,
  cancel,
  noShow,
  addCustomer,
  checkIn,
  checkingIn
} = await useQueue(shopId, { onChange: refreshDashboard })

// Online joins change today's numbers too.
usePolling(refreshDashboard, 60_000)

const greeting = computed(() => {
  if (!dashboard.value) {
    return ''
  }
  const firstName = dashboard.value.owner.name.trim().split(/\s+/)[0]
  return `${greetingFor(new Date(), timeZone.value)}, ${firstName}`
})

const todayLabel = computed(() =>
  new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timeZone.value })
    .format(new Date())
)

const stats = computed(() => {
  if (!dashboard.value) {
    return []
  }
  const { today, shop } = dashboard.value
  return [
    { label: 'Customers today', value: String(today.customers) },
    {
      label: 'Revenue today',
      value: formatMoney(today.revenueMinor, shop.currency),
      hint: 'Payments received'
    },
    { label: 'Services completed', value: String(today.servicesCompleted) }
  ]
})

const lanes = computed(() => queue.value?.barbers ?? [])
const barbers = computed(() => lanes.value.map(lane => lane.barber).filter(barber => barber.isActive))

const isQueueLoading = computed(() => !queue.value && (queueStatus.value === 'pending' || queueStatus.value === 'idle'))

// Add customer
const addOpen = ref(false)

async function onAddCustomer(body: JoinQueueBody) {
  if (await addCustomer(body)) {
    addOpen.value = false
  }
}

function isPending(entryId: string | undefined, action: 'start' | 'complete') {
  return !!entryId && pending.value?.entryId === entryId && pending.value.action === action
}

// Cancel and no-show can't be undone, so they are confirmed first.
type WaitingItem = WaitingEntryDto<QueueEntryDto>
const confirming = ref<{ action: 'cancel' | 'no-show', item: WaitingItem } | null>(null)

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
  const name = target.item.entry.customer.name
  return target.action === 'cancel'
    ? {
        title: `Cancel ${name}?`,
        description: 'They will be removed from the queue and everyone behind them moves up.',
        label: 'Cancel customer'
      }
    : {
        title: `Mark ${name} as no-show?`,
        description: 'Use this when the customer didn\'t turn up. Everyone behind them moves up.',
        label: 'Mark no-show'
      }
})

// Complete → payment modal → method → completed and paid in one request.
const payingEntry = ref<QueueEntryDto | null>(null)
const submittingPayment = ref<PaymentMethod | 'NONE' | null>(null)

const paymentOpen = computed({
  get: () => payingEntry.value !== null,
  set: (value) => {
    if (!value && submittingPayment.value === null) {
      payingEntry.value = null
    }
  }
})

async function onCompleteWithPayment(payment: PaymentInput | null) {
  const entry = payingEntry.value
  if (!entry || !dashboard.value) {
    return
  }
  submittingPayment.value = payment?.method ?? 'NONE'
  const ok = await complete(entry.id, payment, dashboard.value.shop.currency)
  submittingPayment.value = null
  if (ok) {
    payingEntry.value = null
  }
}

async function onConfirm() {
  const target = confirming.value
  if (!target) {
    return
  }
  await (target.action === 'cancel' ? cancel(target.item.entry.id) : noShow(target.item.entry.id))
  confirming.value = null
}
</script>

<template>
  <UContainer class="space-y-6 py-6 sm:py-8">
    <!-- Dashboard failed entirely (e.g. no shop, or the server is unreachable) -->
    <UAlert
      v-if="dashboardError && !dashboard"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load your shop"
      :description="getApiErrorMessage(dashboardError)"
      :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refreshDashboard() }]"
    />

    <template v-else>
      <!-- Header -->
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div v-if="dashboard">
          <p class="text-sm text-muted">
            {{ todayLabel }} · {{ dashboard.shop.name }}
          </p>
          <h1 class="mt-1 text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
            {{ greeting }}
          </h1>
        </div>
        <div
          v-else
          class="space-y-2"
        >
          <USkeleton class="h-4 w-48" />
          <USkeleton class="h-8 w-64" />
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <USwitch
            v-if="dashboard"
            :model-value="dashboard.shop.isOpen"
            :loading="updatingOpen"
            :disabled="updatingOpen"
            :label="dashboard.shop.isOpen ? 'Open' : 'Closed'"
            description="Online joining"
            @update:model-value="value => setOpen(value)"
          />
          <UButton
            v-if="dashboard"
            :to="`/shop/${dashboard.shop.slug}`"
            target="_blank"
            label="Customer page"
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="lg"
          />
          <UButton
            label="Add Customer"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="lg"
            :disabled="!queue"
            @click="addOpen = true"
          />
        </div>
      </header>

      <!-- Summary -->
      <section
        class="grid grid-cols-3 gap-3 sm:gap-4"
        aria-label="Today"
      >
        <template v-if="dashboard">
          <StatCard
            v-for="stat in stats"
            :key="stat.label"
            :label="stat.label"
            :value="stat.value"
            :hint="stat.hint"
          />
        </template>
        <template v-else-if="dashboardStatus === 'pending' || dashboardStatus === 'idle'">
          <USkeleton
            v-for="n in 3"
            :key="n"
            class="h-24 rounded-lg"
          />
        </template>
      </section>

      <!-- Queue: loading -->
      <div
        v-if="isQueueLoading"
        class="grid items-start gap-6 lg:grid-cols-5"
      >
        <USkeleton class="h-72 rounded-lg lg:col-span-2" />
        <USkeleton class="h-72 rounded-lg lg:col-span-3" />
      </div>

      <!-- Queue: failed to load -->
      <UAlert
        v-else-if="!queue"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Couldn't load the queue"
        :description="queueError ? getApiErrorMessage(queueError) : undefined"
        :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refreshQueue() }]"
      />

      <!-- Queue: no barbers -->
      <UCard
        v-else-if="!lanes.length"
        :ui="{ body: 'py-12 text-center' }"
      >
        <UIcon
          name="i-lucide-user-round-x"
          class="size-8 text-dimmed"
        />
        <p class="mt-3 font-medium text-highlighted">
          No active barbers
        </p>
        <p class="mt-1 text-sm text-muted">
          Add a barber to start taking customers.
        </p>
      </UCard>

      <!-- Queue: loaded -->
      <template v-else>
        <UAlert
          v-if="queueError"
          color="warning"
          variant="subtle"
          icon="i-lucide-wifi-off"
          title="Couldn't refresh the queue. Showing the last update."
          :actions="[{ label: 'Retry', color: 'warning', variant: 'outline', onClick: () => refreshQueue() }]"
        />

        <section
          v-for="lane in lanes"
          :key="lane.barber.id"
          class="space-y-3"
          :aria-label="`${lane.barber.name}'s queue`"
        >
          <h2
            v-if="lanes.length > 1"
            class="text-sm font-semibold text-toned"
          >
            {{ lane.barber.name }}
          </h2>

          <div class="grid items-start gap-6 lg:grid-cols-5">
            <div class="space-y-6 lg:sticky lg:top-20 lg:col-span-2">
              <CurrentCustomer
                :current="lane.current"
                :next="lane.waiting[0] ?? null"
                :time-zone="timeZone"
                :completing="isPending(lane.current?.entry.id, 'complete')"
                :starting="isPending(lane.waiting[0]?.entry.id, 'start')"
                :busy="pending !== null"
                @complete="payingEntry = lane.current?.entry ?? null"
                @start="start"
              />

              <!-- Appointment → customer arrives → check in → queue -->
              <UpcomingAppointments
                v-if="lane.upcoming.length && queue"
                :upcoming="lane.upcoming"
                :time-zone="timeZone"
                :calculated-at="queue.calculatedAt"
                :checking-in="checkingIn"
                @check-in="checkIn"
              />
            </div>

            <QueueList
              class="lg:col-span-3"
              :items="lane.waiting"
              :time-zone="timeZone"
              :can-start="lane.current === null"
              :pending="pending"
              @start="item => start(item.entry.id)"
              @cancel="item => (confirming = { action: 'cancel', item })"
              @no-show="item => (confirming = { action: 'no-show', item })"
              @add="addOpen = true"
            />
          </div>
        </section>
      </template>
    </template>

    <AddCustomerModal
      v-if="dashboard"
      v-model:open="addOpen"
      :shop-id="dashboard.shop.id"
      :currency="dashboard.shop.currency"
      :barbers="barbers"
      :submitting="adding"
      @submit="onAddCustomer"
    />

    <CompleteServiceModal
      v-if="dashboard"
      v-model:open="paymentOpen"
      :entry="payingEntry"
      :currency="dashboard.shop.currency"
      :submitting="submittingPayment"
      @complete="onCompleteWithPayment"
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
