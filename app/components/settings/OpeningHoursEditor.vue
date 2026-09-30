<script setup lang="ts">
import type { OpeningHours } from '#shared/schemas/hours'

const days = defineModel<OpeningHours['days']>({ required: true })

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function setOpen(weekday: number, isOpen: boolean) {
  const day = days.value.find(item => item.weekday === weekday)
  if (day) {
    day.ranges = isOpen ? [{ opens: '09:00', closes: '18:00' }] : []
  }
}

function addBreak(weekday: number) {
  const day = days.value.find(item => item.weekday === weekday)
  const first = day?.ranges[0]
  if (!day || !first || day.ranges.length > 1) {
    return
  }
  // Split the day around a one-hour break in the middle.
  day.ranges = [{ opens: first.opens, closes: '13:00' }, { opens: '14:00', closes: first.closes }]
}

function removeRange(weekday: number, index: number) {
  const day = days.value.find(item => item.weekday === weekday)
  if (day && day.ranges.length > 1) {
    day.ranges.splice(index, 1)
  }
}
</script>

<template>
  <ul class="divide-y divide-default">
    <li
      v-for="day in days"
      :key="day.weekday"
      class="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-6"
    >
      <div class="flex w-40 shrink-0 items-center justify-between gap-3 sm:pt-1.5">
        <span class="font-medium text-highlighted">{{ DAY_NAMES[day.weekday - 1] }}</span>
        <USwitch
          :model-value="day.ranges.length > 0"
          :label="day.ranges.length > 0 ? 'Open' : 'Closed'"
          @update:model-value="value => setOpen(day.weekday, value)"
        />
      </div>

      <div
        v-if="day.ranges.length"
        class="flex flex-1 flex-col gap-2"
      >
        <div
          v-for="(range, index) in day.ranges"
          :key="index"
          class="flex items-center gap-2"
        >
          <UInput
            v-model="range.opens"
            type="time"
            step="900"
            class="w-32"
            :aria-label="`${DAY_NAMES[day.weekday - 1]} opens`"
          />
          <span class="text-muted">–</span>
          <UInput
            v-model="range.closes"
            type="time"
            step="900"
            class="w-32"
            :aria-label="`${DAY_NAMES[day.weekday - 1]} closes`"
          />
          <UButton
            v-if="day.ranges.length > 1"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Remove this time range"
            @click="removeRange(day.weekday, index)"
          />
        </div>
        <UButton
          v-if="day.ranges.length === 1"
          label="Add a break"
          icon="i-lucide-plus"
          color="neutral"
          variant="link"
          size="sm"
          class="self-start px-0"
          @click="addBreak(day.weekday)"
        />
      </div>
    </li>
  </ul>
</template>
