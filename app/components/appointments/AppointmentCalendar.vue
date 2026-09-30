<script setup lang="ts">
const props = defineProps<{
  /** "YYYY-MM" */
  month: string
  /** Shop's today, "YYYY-MM-DD". */
  today: string
  selected: string | null
  /** Active (booked or checked-in) appointments per date. */
  counts: Record<string, number>
}>()

const emit = defineEmits<{
  select: [date: string]
  month: [delta: number]
}>()

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const title = computed(() =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${props.month}-01T00:00:00Z`))
)

// Monday on/before the 1st through Sunday on/after the last day.
const cells = computed(() => {
  const first = `${props.month}-01`
  const start = addLocalDays(first, 1 - isoWeekday(first))
  const [year, month] = props.month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10)
  const end = addLocalDays(lastDay, 7 - isoWeekday(lastDay))

  const dates: string[] = []
  for (let date = start; date <= end; date = addLocalDays(date, 1)) {
    dates.push(date)
  }
  return dates.map(date => ({
    date,
    day: Number(date.slice(8)),
    inMonth: date.startsWith(props.month),
    count: props.counts[date] ?? 0
  }))
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        aria-label="Previous month"
        @click="emit('month', -1)"
      />
      <p class="font-semibold text-highlighted">
        {{ title }}
      </p>
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        aria-label="Next month"
        @click="emit('month', 1)"
      />
    </div>

    <div class="grid grid-cols-7 gap-1 px-2 pb-3 sm:px-4">
      <span
        v-for="weekday in WEEKDAYS"
        :key="weekday"
        class="pb-1 text-center text-[11px] font-medium text-muted"
      >{{ weekday }}</span>

      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm tabular-nums transition-colors"
        :class="[
          cell.date === selected ? 'bg-inverted text-inverted' : 'hover:bg-elevated',
          cell.inMonth ? '' : 'opacity-40',
          cell.date === today && cell.date !== selected ? 'font-semibold ring-1 ring-inset ring-accented' : ''
        ]"
        :aria-label="`${cell.date}: ${cell.count} ${cell.count === 1 ? 'appointment' : 'appointments'}`"
        :aria-pressed="cell.date === selected"
        @click="emit('select', cell.date)"
      >
        {{ cell.day }}
        <span
          v-if="cell.count"
          class="mt-0.5 text-[10px] font-semibold leading-none"
          :class="cell.date === selected ? 'text-inverted' : 'text-highlighted'"
        >{{ cell.count }}</span>
      </button>
    </div>
  </div>
</template>
