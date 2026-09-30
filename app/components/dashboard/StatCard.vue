<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  hint?: string
  /** Percent change vs the previous period; null = nothing to compare. */
  change?: number | null
  /** "vs yesterday", "vs last week", … */
  changeLabel?: string
}>()

// Every figure here is "more is better", so up = good.
const changeLook = computed(() => {
  const change = props.change
  if (change === undefined || change === null) {
    return null
  }
  if (change > 0) {
    return { text: `+${change}%`, icon: 'i-lucide-trending-up', class: 'text-success' }
  }
  if (change < 0) {
    return { text: `${change}%`, icon: 'i-lucide-trending-down', class: 'text-error' }
  }
  return { text: '0%', icon: 'i-lucide-minus', class: 'text-muted' }
})
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-5' }">
    <p class="text-xs font-medium text-muted sm:text-sm">
      {{ label }}
    </p>
    <p class="mt-1 text-xl font-semibold tracking-tight text-highlighted sm:text-2xl">
      {{ value }}
    </p>
    <p
      v-if="changeLook"
      class="mt-1 flex items-center gap-1 text-xs"
    >
      <span
        class="inline-flex items-center gap-0.5 font-medium"
        :class="changeLook.class"
      >
        <UIcon
          :name="changeLook.icon"
          class="size-3.5"
        />
        {{ changeLook.text }}
      </span>
      <span
        v-if="changeLabel"
        class="text-dimmed"
      >{{ changeLabel }}</span>
    </p>
    <p
      v-else-if="change === null && changeLabel"
      class="mt-1 text-xs text-dimmed"
    >
      — {{ changeLabel }}
    </p>
    <p
      v-if="hint"
      class="mt-0.5 text-xs text-dimmed"
    >
      {{ hint }}
    </p>
  </UCard>
</template>
