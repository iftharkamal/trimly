<script setup lang="ts">
// Open or closed to online customers: two clear choices (not a switch that's
// easy to bump), with the current one marked.
const props = defineProps<{
  isOpen: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  change: [isOpen: boolean]
}>()

const choices = [
  { value: true, label: 'Open', hint: 'Customers can join online', icon: 'i-lucide-door-open' },
  { value: false, label: 'Closed', hint: 'Walk-ins only', icon: 'i-lucide-door-closed' }
] as const

function choose(value: boolean) {
  if (value !== props.isOpen && !props.saving) {
    emit('change', value)
  }
}
</script>

<template>
  <div class="space-y-3">
    <div
      class="grid grid-cols-2 gap-3"
      role="radiogroup"
      aria-label="Taking online customers"
    >
      <button
        v-for="choice in choices"
        :key="choice.label"
        type="button"
        role="radio"
        :aria-checked="isOpen === choice.value"
        :disabled="saving"
        class="flex flex-col items-start gap-2 rounded-xl p-4 text-left ring-1 transition-colors disabled:opacity-60"
        :class="isOpen === choice.value
          ? (choice.value ? 'bg-success/10 ring-success' : 'bg-elevated ring-inverted')
          : 'ring-default hover:bg-elevated'"
        @click="choose(choice.value)"
      >
        <span class="flex items-center gap-2 font-semibold text-highlighted">
          <span
            class="size-2.5 rounded-full"
            :class="choice.value ? 'bg-success' : 'bg-dimmed'"
          />
          {{ choice.label }}
        </span>
        <span class="text-sm text-muted">{{ choice.hint }}</span>
      </button>
    </div>
    <p class="text-sm text-muted">
      You can always add walk-ins, open or closed.
    </p>
  </div>
</template>
