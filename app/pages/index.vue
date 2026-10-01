<script setup lang="ts">
useHead({ title: 'Trimly · Skip the wait at your barber' })

// Anything this phone is in the middle of (queue place, booking), live.
const { visits } = useRecentVisits()

const steps = [
  { icon: 'i-lucide-user-plus', title: 'Join from your phone', text: 'Pick a service and join the queue, or book a time.' },
  { icon: 'i-lucide-radio', title: 'Watch your place live', text: 'See how many are ahead and your estimated wait.' },
  { icon: 'i-lucide-footprints', title: 'Walk in on time', text: 'We\'ll alert you when your turn is getting close.' }
]
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <div class="flex items-center gap-2">
        <span class="grid size-8 place-items-center rounded-lg bg-inverted text-inverted">
          <UIcon
            name="i-lucide-scissors"
            class="size-4"
          />
        </span>
        <span class="text-lg font-semibold tracking-tight text-highlighted">Trimly</span>
      </div>
      <UColorModeButton size="sm" />
    </header>

    <main class="mx-auto w-full max-w-md flex-1 space-y-10 px-5 pt-8 pb-10">
      <!-- Pick up where you left off -->
      <RecentVisits
        v-if="visits.length"
        :visits="visits"
      />

      <section>
        <h1 class="text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-highlighted">
          Skip the wait.<br>
          <span class="text-dimmed">Not the haircut.</span>
        </h1>
        <p class="mt-4 text-base leading-relaxed text-muted">
          Join your barber's queue from your phone, watch your place live, and walk in right when it's your turn.
        </p>
      </section>

      <QueuePreview />

      <section aria-labelledby="how-it-works">
        <h2
          id="how-it-works"
          class="sr-only"
        >
          How it works
        </h2>
        <ol class="space-y-5">
          <li
            v-for="step in steps"
            :key="step.title"
            class="flex gap-4"
          >
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-elevated">
              <UIcon
                :name="step.icon"
                class="size-[18px] text-highlighted"
              />
            </span>
            <span>
              <span class="block font-medium text-highlighted">{{ step.title }}</span>
              <span class="block text-sm text-muted">{{ step.text }}</span>
            </span>
          </li>
        </ol>
      </section>
    </main>

    <!-- Fixed to the bottom, within thumb reach -->
    <footer class="sticky bottom-0 z-10 border-t border-default bg-canvas/85 backdrop-blur-md">
      <div class="mx-auto w-full max-w-md px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <NuxtLink
          to="/dashboard"
          class="flex min-h-11 items-center justify-center gap-1.5 text-sm font-medium text-muted hover:text-highlighted"
        >
          Barber? Open your dashboard
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4"
          />
        </NuxtLink>
      </div>
    </footer>
  </div>
</template>
