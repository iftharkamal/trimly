<script setup lang="ts">
defineProps<{
  label: string
  value: string
  hint?: string
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-5' }">
    <p class="text-xs font-medium text-muted sm:text-sm">
      {{ label }}
    </p>
    <p class="mt-1 text-xl font-semibold tabular-nums tracking-tight text-highlighted sm:text-2xl">
      {{ value }}
    </p>
    <p
      v-if="hint"
      class="mt-0.5 text-xs text-dimmed"
    >
      {{ hint }}
    </p>
  </UCard>
</template>
