<script setup lang="ts">
import type { CustomerQueueView } from '~/composables/usePublicQueue'

const props = defineProps<{
  queue: CustomerQueueView
  timeZone: string
  isOpen: boolean
}>()

// "Any barber" is where a new customer would go: the server's pick.
const soonestLane = computed(() =>
  props.queue.barbers.find(lane => lane.barber.id === props.queue.soonestBarberId) ?? null
)

const waitingCount = computed(() => props.queue.barbers.reduce((total, lane) => total + lane.waiting.length, 0))
const busyChairs = computed(() => props.queue.barbers.filter(lane => lane.current !== null))
const activeBarbers = computed(() => props.queue.barbers.filter(lane => lane.barber.isActive).length)

const nowServing = computed(() => {
  if (props.queue.barbers.length === 1) {
    const current = props.queue.barbers[0]?.current
    return current
      ? { title: current.entry.serviceName, detail: `until ~${formatTime(current.estimatedEnd, props.timeZone)}` }
      : { title: 'Chair is free', detail: 'No one in the chair' }
  }
  return {
    title: `${busyChairs.value.length} of ${activeBarbers.value} chairs busy`,
    detail: busyChairs.value.length ? 'Services in progress' : 'All barbers are free'
  }
})
</script>

<template>
  <UCard :ui="{ body: 'p-5' }">
    <div v-if="isOpen && soonestLane">
      <p class="text-sm text-muted">
        Estimated wait
      </p>
      <p class="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-highlighted">
        {{ soonestLane.joinPreview.waitMinutes === 0 ? 'No wait' : formatWait(soonestLane.joinPreview.waitMinutes) }}
      </p>
      <p class="mt-1 text-sm text-muted">
        <template v-if="soonestLane.joinPreview.waitMinutes === 0">
          Join now and you're straight in the chair.
        </template>
        <template v-else>
          Join now and you'd start around {{ formatTime(soonestLane.joinPreview.estimatedStart, timeZone) }}.
        </template>
      </p>
    </div>
    <div
      v-else
      class="flex items-center gap-3"
    >
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-elevated">
        <UIcon
          name="i-lucide-moon"
          class="size-5 text-muted"
        />
      </span>
      <div>
        <p class="font-medium text-highlighted">
          Not taking online customers
        </p>
        <p class="text-sm text-muted">
          {{ isOpen ? 'No barber is available right now.' : 'The shop is closed for online joining.' }}
        </p>
      </div>
    </div>

    <dl class="mt-5 grid grid-cols-2 gap-3 border-t border-default pt-4 text-sm">
      <div>
        <dt class="text-muted">
          Now serving
        </dt>
        <dd class="mt-0.5 font-medium text-highlighted">
          {{ nowServing.title }}
        </dd>
        <dd class="text-xs text-dimmed">
          {{ nowServing.detail }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">
          Waiting
        </dt>
        <dd class="mt-0.5 font-medium tabular-nums text-highlighted">
          {{ waitingCount === 0 ? 'No one' : `${waitingCount} ${waitingCount === 1 ? 'person' : 'people'}` }}
        </dd>
        <dd class="text-xs text-dimmed">
          Updated {{ formatTime(queue.calculatedAt, timeZone) }}
        </dd>
      </div>
    </dl>
  </UCard>
</template>
