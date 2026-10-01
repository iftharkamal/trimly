<script setup lang="ts">
// Password field with show/hide (so people can check what their phone keyboard
// typed) and no auto-capitalisation or autocorrect.
defineProps<{
  autocomplete: 'current-password' | 'new-password'
}>()

const value = defineModel<string>({ required: true })
const visible = ref(false)
</script>

<template>
  <UInput
    v-model="value"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    autocapitalize="none"
    autocorrect="off"
    spellcheck="false"
    size="xl"
    class="w-full"
    :ui="{ trailing: 'pe-1' }"
  >
    <template #trailing>
      <UButton
        :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="visible ? 'Hide password' : 'Show password'"
        :aria-pressed="visible"
        color="neutral"
        variant="link"
        size="sm"
        @click="visible = !visible"
      />
    </template>
  </UInput>
</template>
