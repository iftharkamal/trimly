<script setup lang="ts">
import type { TrackingState } from '#shared/constants'

const props = defineProps<{
  state: TrackingState
  /** Waiting position (1 = next); null once in the chair. */
  position: number | null
  customersAhead: number | null
}>()

const STEPS: { state: TrackingState, label: string }[] = [
  { state: 'WAITING', label: 'Waiting' },
  { state: 'GETTING_CLOSE', label: 'Getting close' },
  { state: 'YOU_ARE_NEXT', label: 'Next' },
  { state: 'IN_PROGRESS', label: 'In the chair' }
]

const currentStep = computed(() => STEPS.findIndex(step => step.state === props.state))

// People between the customer and the chair. Anyone ahead beyond the waiting
// positions before them is the person currently being served.
const MAX_DOTS = 6
const ahead = computed(() => props.customersAhead ?? 0)
const someoneInChair = computed(() => props.position !== null && ahead.value > props.position - 1)
const waitingAhead = computed(() => Math.max(0, ahead.value - (someoneInChair.value ? 1 : 0)))
const shownDots = computed(() => Math.min(waitingAhead.value, MAX_DOTS))
const hiddenDots = computed(() => waitingAhead.value - shownDots.value)
</script>

<template>
  <div class="space-y-5">
    <!-- Line: chair ← people ahead ← you -->
    <div
      v-if="state !== 'IN_PROGRESS'"
      class="flex items-center gap-2"
      role="img"
      :aria-label="`${ahead} ${ahead === 1 ? 'customer' : 'customers'} ahead of you`"
    >
      <span
        class="grid size-9 shrink-0 place-items-center rounded-full"
        :class="someoneInChair ? 'bg-inverted text-inverted' : 'bg-elevated text-dimmed'"
      >
        <UIcon
          name="i-lucide-scissors"
          class="size-4"
        />
      </span>
      <span class="h-px flex-1 bg-accented" />
      <template
        v-for="n in shownDots"
        :key="n"
      >
        <span class="size-3 shrink-0 rounded-full bg-accented" />
      </template>
      <span
        v-if="hiddenDots"
        class="text-xs font-medium tabular-nums text-muted"
      >+{{ hiddenDots }}</span>
      <span
        v-if="shownDots"
        class="h-px flex-1 bg-accented"
      />
      <span class="grid h-9 shrink-0 place-items-center rounded-full bg-primary px-3 text-sm font-semibold text-inverted">
        You
      </span>
    </div>

    <!-- Steps -->
    <ol class="grid grid-cols-4 gap-1.5">
      <li
        v-for="(step, index) in STEPS"
        :key="step.state"
        class="space-y-1.5"
      >
        <span
          class="block h-1.5 rounded-full transition-colors"
          :class="index <= currentStep ? 'bg-primary' : 'bg-accented'"
        />
        <span
          class="block text-[11px] leading-tight"
          :class="index === currentStep ? 'font-semibold text-highlighted' : 'text-muted'"
        >
          {{ step.label }}
        </span>
      </li>
    </ol>
  </div>
</template>
