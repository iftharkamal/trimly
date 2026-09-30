<script setup lang="ts">
import type { QueueEntryDto, WaitingEntryDto } from '#shared/types/queue'
import type { QueueAction } from '~/composables/useQueue'

defineProps<{
  item: WaitingEntryDto<QueueEntryDto>
  timeZone: string
  /** False while someone is in the chair: the barber must complete first. */
  canStart: boolean
  /** The action in flight for this entry, if any. */
  pendingAction: QueueAction | null
  /** Another action is in flight; block new taps. */
  busy: boolean
}>()

const emit = defineEmits<{
  'start': []
  'cancel': []
  'no-show': []
}>()
</script>

<template>
  <li class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
    <div class="flex min-w-0 flex-1 items-center gap-4">
      <span
        class="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums"
        :class="item.position === 1 ? 'bg-primary/10 text-primary' : 'bg-elevated text-toned'"
        :aria-label="`Position ${item.position}`"
      >
        {{ item.position }}
      </span>

      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-2 font-medium text-highlighted">
          <span class="truncate">{{ item.entry.customer.name }}</span>
          <UBadge
            v-if="item.entry.source === 'WALK_IN'"
            label="Walk-in"
            color="neutral"
            variant="subtle"
            size="sm"
            class="shrink-0"
          />
        </p>
        <p class="truncate text-sm text-muted">
          {{ item.entry.serviceName }} · {{ formatMinutes(item.entry.durationMinutes) }}
        </p>
      </div>

      <div class="shrink-0 text-right">
        <p class="font-semibold tabular-nums text-highlighted">
          {{ formatWait(item.waitMinutes) }}
        </p>
        <p class="text-xs tabular-nums text-muted">
          starts {{ formatTime(item.estimatedStart, timeZone) }}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <UButton
        label="Start"
        icon="i-lucide-play"
        :variant="item.position === 1 && canStart ? 'solid' : 'soft'"
        :disabled="!canStart || (busy && pendingAction !== 'start')"
        :loading="pendingAction === 'start'"
        :title="canStart ? undefined : 'Complete the current service first'"
        class="flex-1 justify-center sm:flex-none"
        @click="emit('start')"
      />
      <UButton
        label="No-show"
        icon="i-lucide-user-x"
        color="neutral"
        variant="ghost"
        :disabled="busy && pendingAction !== 'no-show'"
        :loading="pendingAction === 'no-show'"
        @click="emit('no-show')"
      />
      <UButton
        label="Cancel"
        icon="i-lucide-x"
        color="error"
        variant="ghost"
        :disabled="busy && pendingAction !== 'cancel'"
        :loading="pendingAction === 'cancel'"
        @click="emit('cancel')"
      />
    </div>
  </li>
</template>
