<script setup lang="ts">
// The shop's status at a glance ("● Open" / "● Closed"); tap to change it.
const props = defineProps<{
  isOpen: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  change: [isOpen: boolean]
}>()

const sheetOpen = ref(false)

function onChange(isOpen: boolean) {
  sheetOpen.value = false
  emit('change', isOpen)
}
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors"
    :class="props.isOpen ? 'bg-success/10 text-success ring-success/30 hover:bg-success/15' : 'bg-elevated text-muted ring-default hover:bg-accented'"
    :aria-label="`Shop is ${props.isOpen ? 'open' : 'closed'} to online customers. Change`"
    :disabled="saving"
    @click="sheetOpen = true"
  >
    <UIcon
      v-if="saving"
      name="i-lucide-loader-circle"
      class="size-3 animate-spin"
    />
    <span
      v-else
      class="size-2 rounded-full"
      :class="props.isOpen ? 'bg-success' : 'bg-dimmed'"
    />
    {{ props.isOpen ? 'Open' : 'Closed' }}
  </button>

  <UModal
    v-model:open="sheetOpen"
    title="Taking online customers?"
  >
    <template #body>
      <ShopStatusChooser
        :is-open="props.isOpen"
        :saving="saving"
        @change="onChange"
      />
    </template>
  </UModal>
</template>
