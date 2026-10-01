<!-- Decorative: a miniature of the live status card, to show what Trimly does. -->
<template>
  <div
    aria-hidden="true"
    class="relative mx-auto w-full max-w-xs select-none"
  >
    <!-- Card behind, for depth -->
    <div class="absolute inset-x-6 -bottom-3 h-full rounded-3xl bg-elevated" />

    <div class="relative rounded-3xl bg-default p-5 shadow-lg ring-1 ring-default">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-muted">Your barber</span>
        <span class="flex items-center gap-1.5 text-[11px] font-medium text-muted">
          <span class="size-1.5 rounded-full bg-success" />
          Live
        </span>
      </div>

      <p class="mt-4 text-4xl font-bold tracking-tight text-highlighted">
        You're #2
      </p>
      <p class="mt-1 text-sm text-muted">
        1 customer ahead
      </p>

      <div class="mt-5 flex items-center gap-2">
        <span class="grid size-8 place-items-center rounded-full bg-inverted text-inverted">
          <UIcon
            name="i-lucide-scissors"
            class="size-3.5"
          />
        </span>
        <span class="h-px flex-1 bg-accented" />
        <span class="size-2.5 rounded-full bg-accented" />
        <span class="h-px flex-1 bg-accented" />
        <span class="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-inverted">You</span>
      </div>

      <div class="mt-5 flex items-end justify-between border-t border-default pt-4">
        <div>
          <p class="text-[11px] text-muted">
            Estimated wait
          </p>
          <p class="text-xl font-semibold text-highlighted">
            ~15 min
          </p>
        </div>
        <span class="rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning">
          Getting close
        </span>
      </div>
    </div>
  </div>
</template>
