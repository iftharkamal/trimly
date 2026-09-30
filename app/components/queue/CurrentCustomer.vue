<script setup lang="ts">
import type { CurrentServiceDto, QueueEntryDto, WaitingEntryDto } from '#shared/types/queue'

const props = defineProps<{
  current: CurrentServiceDto<QueueEntryDto> | null
  /** First waiting customer, offered as a one-tap start when the chair is free. */
  next: WaitingEntryDto<QueueEntryDto> | null
  timeZone: string
  completing: boolean
  starting: boolean
  /** Another action is in flight; block new taps. */
  busy: boolean
}>()

const emit = defineEmits<{
  complete: [entryId: string]
  start: [entryId: string]
}>()

const progress = computed(() => {
  if (!props.current) {
    return 0
  }
  const { elapsedMinutes } = props.current
  return Math.min(elapsedMinutes, props.current.entry.durationMinutes)
})
</script>

<template>
  <UCard
    :ui="{
      root: current ? 'shadow-md' : '',
      body: 'p-5 sm:p-6'
    }"
  >
    <p class="text-xs font-semibold uppercase tracking-widest text-muted">
      Currently serving
    </p>

    <template v-if="current">
      <div class="mt-3 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
            {{ current.entry.customer.name }}
          </h2>
          <p class="mt-1 text-muted">
            {{ current.entry.serviceName }} · {{ formatMinutes(current.entry.durationMinutes) }}
          </p>
        </div>
        <UBadge
          v-if="current.isOverrunning"
          color="warning"
          variant="subtle"
          icon="i-lucide-timer"
          label="Over time"
          class="shrink-0"
        />
      </div>

      <dl class="mt-6 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt class="text-muted">
            Started
          </dt>
          <dd class="mt-0.5 font-medium tabular-nums text-highlighted">
            {{ current.entry.startedAt ? formatTime(current.entry.startedAt, timeZone) : '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Elapsed
          </dt>
          <dd class="mt-0.5 font-medium tabular-nums text-highlighted">
            {{ current.elapsedMinutes }} / {{ current.entry.durationMinutes }} min
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Est. finish
          </dt>
          <dd class="mt-0.5 font-medium tabular-nums text-highlighted">
            {{ formatTime(current.estimatedEnd, timeZone) }}
          </dd>
        </div>
      </dl>

      <UProgress
        :model-value="progress"
        :max="current.entry.durationMinutes"
        :color="current.isOverrunning ? 'warning' : 'primary'"
        size="sm"
        class="mt-4"
      />

      <UButton
        block
        size="xl"
        icon="i-lucide-check"
        label="Complete Service"
        :loading="completing"
        :disabled="busy && !completing"
        class="mt-6 min-h-16 text-lg font-semibold"
        @click="emit('complete', current.entry.id)"
      />
    </template>

    <div
      v-else
      class="mt-4"
    >
      <div class="flex items-center gap-3">
        <span class="grid size-11 shrink-0 place-items-center rounded-full bg-elevated">
          <UIcon
            name="i-lucide-armchair"
            class="size-5 text-muted"
          />
        </span>
        <div>
          <p class="font-medium text-highlighted">
            Chair is free
          </p>
          <p class="text-sm text-muted">
            <template v-if="next">
              Next up: {{ next.entry.customer.name }} · {{ next.entry.serviceName }}
            </template>
            <template v-else>
              No one is waiting right now.
            </template>
          </p>
        </div>
      </div>

      <UButton
        v-if="next"
        block
        size="xl"
        icon="i-lucide-play"
        :label="`Start ${next.entry.customer.name}`"
        :loading="starting"
        :disabled="busy && !starting"
        class="mt-6 min-h-16 text-lg font-semibold"
        @click="emit('start', next.entry.id)"
      />
    </div>
  </UCard>
</template>
