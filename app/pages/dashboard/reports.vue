<script setup lang="ts">
import { REPORT_PERIODS, type ReportPeriod } from '#shared/constants'
import type { ReportDto } from '#shared/types/report'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'shop', 'owner'] })
useHead({ title: 'Reports · Trimly' })

const route = useRoute()

// Period and date live in the URL, so back/forward and bookmarks work.
const period = computed<ReportPeriod>(() => {
  const value = route.query.period
  return REPORT_PERIODS.includes(value as ReportPeriod) ? (value as ReportPeriod) : 'day'
})
const date = computed(() => (typeof route.query.date === 'string' ? route.query.date : undefined))

const { report, status, error, refresh } = await useReport(period, date)

// Keep showing the last report while the next period loads.
const shown = ref<ReportDto | null>(report.value ?? null)
watch(report, (value) => {
  if (value) {
    shown.value = value
  }
})
const isLoading = computed(() => status.value === 'pending')

function go(query: { period?: ReportPeriod, date?: string | null }) {
  const next = { period: query.period ?? period.value, date: query.date === undefined ? date.value : query.date }
  return navigateTo({ query: { period: next.period, ...(next.date ? { date: next.date } : {}) } }, { replace: true })
}

const tabs = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' }
]

const selectedTab = computed({
  get: () => period.value,
  // Switching period keeps the date, so "this week" contains the day you were on.
  set: value => go({ period: value as ReportPeriod })
})

const isCurrent = computed(() => shown.value?.nextDate === null)

const periodTitle = computed(() => {
  const value = shown.value
  if (!value) {
    return ''
  }
  if (isCurrent.value) {
    return { day: 'Today', week: 'This week', month: 'This month' }[value.period]
  }
  return formatReportPeriod(value.period, value.start, value.end)
})

const periodSubtitle = computed(() => {
  const value = shown.value
  return value && isCurrent.value ? formatReportPeriod(value.period, value.start, value.end) : ''
})

const changeLabel = computed(() => (shown.value
  ? { day: 'vs previous day', week: 'vs previous week', month: 'vs previous month' }[shown.value.period]
  : ''))

const stats = computed(() => {
  const value = shown.value
  if (!value) {
    return []
  }
  const { totals, changes, currency } = value
  return [
    { label: 'Revenue', value: formatMoney(totals.revenueMinor, currency), change: changes.revenue },
    { label: 'Customers served', value: String(totals.customers), change: changes.customers },
    { label: 'Services', value: String(totals.services), change: changes.services },
    {
      label: 'Average bill',
      value: totals.averageBillMinor === null ? '—' : formatMoney(totals.averageBillMinor, currency),
      change: changes.averageBill
    }
  ]
})
</script>

<template>
  <UContainer class="space-y-6 py-6 sm:py-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
        Reports
      </h1>
      <UTabs
        v-model="selectedTab"
        :items="tabs"
        :content="false"
        size="md"
        class="w-full sm:w-auto"
      />
    </header>

    <!-- First load failed -->
    <UAlert
      v-if="!shown && error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load the report"
      :description="getApiErrorMessage(error)"
      :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <!-- First load -->
    <div
      v-else-if="!shown"
      class="space-y-6"
    >
      <USkeleton class="h-10 w-72" />
      <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-24 rounded-xl"
        />
      </div>
      <USkeleton class="h-72 rounded-xl" />
    </div>

    <template v-else>
      <!-- Period navigator -->
      <div class="flex items-center justify-between gap-3">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="outline"
          aria-label="Previous period"
          :disabled="isLoading"
          @click="go({ date: shown.previousDate })"
        />
        <div class="min-w-0 text-center">
          <p class="truncate font-semibold text-highlighted">
            {{ periodTitle }}
          </p>
          <p
            v-if="periodSubtitle"
            class="truncate text-xs text-muted"
          >
            {{ periodSubtitle }}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            v-if="!isCurrent"
            label="Now"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="isLoading"
            @click="go({ date: null })"
          />
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="outline"
            aria-label="Next period"
            :disabled="isLoading || !shown.nextDate"
            @click="shown.nextDate && go({ date: shown.nextDate })"
          />
        </div>
      </div>

      <UAlert
        v-if="error"
        color="warning"
        variant="subtle"
        icon="i-lucide-wifi-off"
        title="Couldn't load that period. Showing the last one."
        :actions="[{ label: 'Retry', color: 'warning', variant: 'outline', onClick: () => refresh() }]"
      />

      <div
        class="space-y-6 transition-opacity"
        :class="isLoading ? 'opacity-50' : ''"
        :aria-busy="isLoading"
      >
        <!-- Overview -->
        <section
          class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
          aria-label="Overview"
        >
          <StatCard
            v-for="stat in stats"
            :key="stat.label"
            :label="stat.label"
            :value="stat.value"
            :change="stat.change"
            :change-label="changeLabel"
          />
        </section>

        <RevenueChart
          :unit="shown.trend.unit"
          :buckets="shown.trend.buckets"
          :currency="shown.currency"
          :period="shown.period"
        />

        <p class="text-xs text-dimmed">
          Revenue is money received. Customers served and services count completed services.
          Average bill is revenue per payment. Times are in shop time.
        </p>
      </div>
    </template>
  </UContainer>
</template>
