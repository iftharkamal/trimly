<script setup lang="ts">
// Single-series column chart of revenue per hour or day. No chart library:
// ink bars (≤24px, 4px rounded top, 2px gaps) on hairline gridlines. Each
// column's full height is its hover/tap/focus target; the readout above the
// plot shows the active bar (phones have no hover), and a table view carries
// every value without interaction.
const props = defineProps<{
  unit: 'hour' | 'day'
  buckets: { key: string, revenueMinor: number }[]
  currency: string
  /** Week (7 days) or month, to pick day labels. */
  period: 'day' | 'week' | 'month'
}>()

const showTable = ref(false)
const activeIndex = ref<number | null>(null)

const total = computed(() => props.buckets.reduce((sum, bucket) => sum + bucket.revenueMinor, 0))
const isEmpty = computed(() => total.value === 0)

/** Rounds the axis maximum up to 1, 2, 2.5 or 5 × a power of ten. */
const axisMax = computed(() => {
  const max = Math.max(...props.buckets.map(bucket => bucket.revenueMinor), 0)
  if (max === 0) {
    return 1
  }
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].find(multiple => multiple * magnitude >= max) ?? 10
  return step * magnitude
})

const ticks = computed(() => [axisMax.value, axisMax.value / 2, 0])

function heightPercent(value: number): number {
  return (value / axisMax.value) * 100
}

function fullLabel(key: string) {
  return formatBucket(props.unit, key, 'full')
}

// Sparse x labels so they never collide on a phone.
function axisLabel(index: number, key: string): string | null {
  if (props.unit === 'hour') {
    return index % 6 === 0 ? formatBucket('hour', key, 'full') : null
  }
  if (props.period === 'week') {
    return formatBucket('day', key, 'weekday')
  }
  const day = index + 1
  return day === 1 || day % 5 === 0 ? formatBucket('day', key, 'day') : null
}

const readout = computed(() => {
  const bucket = activeIndex.value === null ? null : props.buckets[activeIndex.value]
  return bucket
    ? { value: formatMoney(bucket.revenueMinor, props.currency), label: fullLabel(bucket.key) }
    : { value: formatMoney(total.value, props.currency), label: 'Total for this period' }
})
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-5' }">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-medium text-muted">
          Revenue {{ unit === 'hour' ? 'by hour' : 'by day' }}
        </h2>
        <p
          class="mt-1 text-2xl font-semibold tracking-tight text-highlighted"
          aria-live="polite"
        >
          {{ readout.value }}
        </p>
        <p class="text-xs text-dimmed">
          {{ readout.label }}
        </p>
      </div>
      <UButton
        v-if="!isEmpty"
        :label="showTable ? 'Chart' : 'Table'"
        :icon="showTable ? 'i-lucide-chart-column' : 'i-lucide-table'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="showTable = !showTable"
      />
    </div>

    <div
      v-if="isEmpty"
      class="mt-6 flex flex-col items-center py-10 text-center"
    >
      <UIcon
        name="i-lucide-chart-column"
        class="size-8 text-dimmed"
      />
      <p class="mt-3 text-sm text-muted">
        No payments in this period.
      </p>
    </div>

    <!-- Table view: every value, no hover needed -->
    <table
      v-else-if="showTable"
      class="mt-4 w-full text-sm"
    >
      <thead>
        <tr class="border-b border-default text-left text-muted">
          <th class="py-2 font-medium">
            {{ unit === 'hour' ? 'Hour' : 'Day' }}
          </th>
          <th class="py-2 text-right font-medium">
            Revenue
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="bucket in buckets"
          :key="bucket.key"
          class="border-b border-default last:border-0"
          :class="bucket.revenueMinor === 0 ? 'text-dimmed' : 'text-highlighted'"
        >
          <td class="py-1.5">
            {{ fullLabel(bucket.key) }}
          </td>
          <td class="py-1.5 text-right tabular-nums">
            {{ formatMoney(bucket.revenueMinor, currency) }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Chart -->
    <div
      v-else
      class="mt-5 flex gap-2"
    >
      <!-- Y axis -->
      <div class="flex h-44 flex-col justify-between text-right text-[11px] tabular-nums text-muted">
        <span
          v-for="tick in ticks"
          :key="tick"
          class="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0"
        >{{ formatMoneyCompact(tick, currency) }}</span>
      </div>

      <div class="min-w-0 flex-1">
        <!-- Plot -->
        <div
          class="relative h-44"
          @pointerleave="activeIndex = null"
        >
          <div
            v-for="tick in ticks"
            :key="tick"
            class="pointer-events-none absolute inset-x-0 border-t border-default"
            :style="{ bottom: `${heightPercent(tick)}%` }"
          />
          <div class="absolute inset-0 flex items-end">
            <button
              v-for="(bucket, index) in buckets"
              :key="bucket.key"
              type="button"
              class="group flex h-full min-w-0 flex-1 items-end justify-center px-px focus-visible:outline-none"
              :aria-label="`${fullLabel(bucket.key)}: ${formatMoney(bucket.revenueMinor, currency)}`"
              @pointerenter="activeIndex = index"
              @focus="activeIndex = index"
              @blur="activeIndex = null"
              @click="activeIndex = activeIndex === index ? null : index"
            >
              <span
                v-if="bucket.revenueMinor > 0"
                class="block w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-default"
                :class="activeIndex !== null && activeIndex !== index ? 'opacity-35' : 'opacity-100'"
                :style="{ height: `max(2px, ${heightPercent(bucket.revenueMinor)}%)` }"
              />
            </button>
          </div>
        </div>

        <!-- X axis -->
        <div class="mt-2 flex text-[11px] text-muted">
          <span
            v-for="(bucket, index) in buckets"
            :key="bucket.key"
            class="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center"
          >{{ axisLabel(index, bucket.key) ?? '' }}</span>
        </div>
      </div>
    </div>
  </UCard>
</template>
