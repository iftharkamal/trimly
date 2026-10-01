<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="relative flex min-h-dvh flex-col items-center justify-center px-5 py-[max(1.5rem,env(safe-area-inset-top))]">
    <UColorModeButton
      size="sm"
      class="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3"
    />
    <div class="w-full max-w-sm">
      <NuxtLink
        to="/"
        class="mb-8 flex items-center justify-center gap-2"
      >
        <span class="grid size-8 place-items-center rounded-lg bg-inverted text-inverted">
          <UIcon
            name="i-lucide-scissors"
            class="size-4"
          />
        </span>
        <span class="text-lg font-semibold tracking-tight text-highlighted">Trimly</span>
      </NuxtLink>

      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
        {{ title }}
      </h1>
      <p
        v-if="description"
        class="mt-1 text-sm text-muted"
      >
        {{ description }}
      </p>

      <div class="mt-6">
        <slot />
      </div>

      <div
        v-if="$slots.footer"
        class="mt-8 text-center text-sm text-muted"
      >
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
