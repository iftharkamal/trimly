<script setup lang="ts">
// The shop's status at a glance: green "● Open", red "● Closed". Tap to
// change it when allowed; otherwise it's a plain label.
const props = withDefaults(defineProps<{
  isOpen: boolean
  saving?: boolean
  /** False when the owner hasn't allowed staff to open and close the shop. */
  editable?: boolean
}>(), {
  saving: false,
  editable: true
})

const emit = defineEmits<{
  change: [isOpen: boolean]
}>()

const sheetOpen = ref(false)

function onChange(isOpen: boolean) {
  sheetOpen.value = false
  emit('change', isOpen)
}

const tone = computed(() => (props.isOpen
  ? 'bg-success/10 text-success ring-success/30'
  : 'bg-error/10 text-error ring-error/30'))
const label = computed(() => (props.isOpen ? 'Open' : 'Closed'))
</script>

<template>
  <button
    v-if="editable"
    type="button"
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors"
    :class="[tone, props.isOpen ? 'hover:bg-success/15' : 'hover:bg-error/15']"
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
      :class="props.isOpen ? 'bg-success' : 'bg-error'"
    />
    {{ label }}
  </button>

  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
    :class="tone"
    :aria-label="`Shop is ${props.isOpen ? 'open' : 'closed'} to online customers`"
    title="Only the owner can open or close the shop"
  >
    <span
      class="size-2 rounded-full"
      :class="props.isOpen ? 'bg-success' : 'bg-error'"
    />
    {{ label }}
  </span>

  <UModal
    v-if="editable"
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
