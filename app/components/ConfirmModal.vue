<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel: string
  confirmColor?: 'error' | 'neutral' | 'primary'
  loading?: boolean
}>(), {
  description: undefined,
  confirmColor: 'error',
  loading: false
})

const emit = defineEmits<{
  confirm: []
}>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
    :close="!loading"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Go back"
          color="neutral"
          variant="ghost"
          :disabled="loading"
          @click="open = false"
        />
        <UButton
          :label="confirmLabel"
          :color="confirmColor"
          :loading="loading"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
