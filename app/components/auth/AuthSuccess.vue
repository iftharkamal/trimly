<script setup lang="ts">
// The "done" state of an auth flow, shown while the next page loads.
defineProps<{
  message: string
}>()
</script>

<template>
  <div
    class="flex flex-col items-center gap-3 rounded-2xl bg-elevated px-6 py-8 text-center"
    role="status"
  >
    <span class="grid size-12 place-items-center rounded-full bg-success/15 text-success">
      <UIcon
        name="i-lucide-check"
        class="size-6"
      />
    </span>
    <p class="text-sm text-muted">
      {{ message }}
    </p>
    <UIcon
      name="i-lucide-loader-circle"
      class="size-4 animate-spin text-dimmed"
      aria-hidden="true"
    />
  </div>
</template>
