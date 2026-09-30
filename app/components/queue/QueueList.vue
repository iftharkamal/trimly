<script setup lang="ts">
import type { QueueEntryDto, WaitingEntryDto } from '#shared/types/queue'
import type { QueueAction } from '~/composables/useQueue'

type WaitingItem = WaitingEntryDto<QueueEntryDto>

const props = defineProps<{
  items: WaitingItem[]
  timeZone: string
  canStart: boolean
  pending: { entryId: string, action: QueueAction } | null
}>()

const emit = defineEmits<{
  'start': [item: WaitingItem]
  'cancel': [item: WaitingItem]
  'no-show': [item: WaitingItem]
  'add': []
}>()

function pendingActionFor(item: WaitingItem): QueueAction | null {
  return props.pending?.entryId === item.entry.id ? props.pending.action : null
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-5' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
          Next customers
        </h2>
        <UBadge
          v-if="items.length"
          :label="`${items.length} waiting`"
          color="neutral"
          variant="subtle"
        />
      </div>
    </template>

    <ul
      v-if="items.length"
      class="divide-y divide-default"
    >
      <QueueItem
        v-for="item in items"
        :key="item.entry.id"
        :item="item"
        :time-zone="timeZone"
        :can-start="canStart"
        :pending-action="pendingActionFor(item)"
        :busy="pending !== null"
        @start="emit('start', item)"
        @cancel="emit('cancel', item)"
        @no-show="emit('no-show', item)"
      />
    </ul>

    <div
      v-else
      class="flex flex-col items-center px-6 py-12 text-center"
    >
      <UIcon
        name="i-lucide-users"
        class="size-8 text-dimmed"
      />
      <p class="mt-3 font-medium text-highlighted">
        No one in the queue
      </p>
      <p class="mt-1 text-sm text-muted">
        Customers who join online or walk in will appear here.
      </p>
      <UButton
        label="Add Customer"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        class="mt-5"
        @click="emit('add')"
      />
    </div>
  </UCard>
</template>
