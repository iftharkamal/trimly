<script setup lang="ts">
import type { JoinQueueBody } from '#shared/schemas/queue'
import type { PaymentMethod } from '#shared/constants'
import type { PaymentInput } from '#shared/schemas/payment'
import type { QueueEntryDto, WaitingEntryDto } from '#shared/types/queue'

definePageMeta({ layout: 'dashboard', middleware: 'auth', shop: 'required' })
useHead({ title: 'Live queue · Trimly' })

const {
  dashboard,
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
  const firstName = dashboard.value.member.name.trim().split(/\s+/)[0]
  return `${greetingFor(new Date(), timeZone.value)}, ${firstName}`
})

// Short: the phone already shows the date.
const todayLabel = computed(() =>
  new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: timeZone.value })
    .format(new Date())
)

// Today's numbers in one quiet line under the queue. Takings: owner only (the server sends null to staff).
const todaySummary = computed(() => {
  if (!dashboard.value) {
    return ''
  }
  const { today, shop } = dashboard.value
  const parts = [
    `${today.customers} ${today.customers === 1 ? 'customer' : 'customers'}`,
    `${today.servicesCompleted} done`
  ]
  if (today.revenueMinor !== null) {
    parts.push(formatMoney(today.revenueMinor, shop.currency))
  }
  return `Today: ${parts.join(' · ')}`
})

// The owner always; staff while the owner allows it (Settings). The server checks too.
const canOpenClose = computed(() => dashboard.value?.member.role === 'OWNER' || !!dashboard.value?.shop.staffCanOpenClose)

// The signed-in barber's own chair first.
const myBarberId = computed(() => dashboard.value?.member.barberId ?? null)
const lanes = computed(() => [...(queue.value?.barbers ?? [])].sort((a, b) => Number(b.barber.id === myBarberId.value) - Number(a.barber.id === myBarberId.value)))
const barbers = computed(() => lanes.value.map(lane => lane.barber).filter(barber => barber.isActive))

const isQueueLoading = computed(() => !queue.value && (queueStatus.value === 'pending' || queueStatus.value === 'idle'))

// The shop's QR code, shown to customers at the chair.
const qrOpen = ref(false)

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
  <UContainer class="space-y-6 pt-6 pb-24 sm:pt-8">
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
      <!-- Calm header: where and who, the shop's status at a glance, and the QR code. -->
      <header class="flex items-center justify-between gap-4">
        <div
          v-if="dashboard"
          class="min-w-0"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span class="truncate">{{ todayLabel }} · {{ dashboard.shop.name }}</span>
            <ShopStatusChip
              :is-open="dashboard.shop.isOpen"
              :saving="updatingOpen"
              :editable="canOpenClose"
              @change="setOpen"
            />
          </div>
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

        <UButton
          v-if="dashboard"
          icon="i-lucide-qr-code"
          aria-label="Show the shop's QR code"
          title="Shop QR code"
          color="neutral"
          variant="outline"
          class="shrink-0 rounded-xl p-3"
          :ui="{ leadingIcon: 'size-7' }"
          @click="qrOpen = true"
        />
      </header>

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
            class="flex items-center gap-2 text-sm font-semibold text-toned"
          >
            {{ lane.barber.name }}
            <UBadge
              v-if="lane.barber.id === myBarberId"
              label="You"
              color="primary"
              variant="subtle"
              size="sm"
            />
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

      <p
        v-if="dashboard"
        class="text-center text-sm text-muted"
        aria-label="Today"
      >
        {{ todaySummary }}
      </p>

      <ShopInfoCard
        v-if="dashboard"
        :shop="dashboard.shop"
        :owner-name="dashboard.owner?.name ?? null"
        :member-role="dashboard.member.role"
      />
    </template>

    <!-- The everyday action, in thumb reach above the tab bar. -->
    <UButton
      v-if="dashboard"
      label="Walk-in"
      icon="i-lucide-plus"
      size="xl"
      class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 rounded-full px-5 shadow-lg lg:right-8 lg:bottom-8 print:hidden"
      aria-label="Add a walk-in customer"
      :disabled="!queue"
      @click="addOpen = true"
    />

    <ShopQrModal
      v-if="dashboard"
      v-model:open="qrOpen"
      :shop-name="dashboard.shop.name"
      :slug="dashboard.shop.slug"
    />

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
