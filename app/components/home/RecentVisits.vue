<script setup lang="ts">
import type { RecentVisit } from '~/composables/useRecentVisits'

defineProps<{
  visits: RecentVisit[]
}>()

function queueLine(visit: Extract<RecentVisit, { kind: 'queue' }>) {
  const { tracking } = visit
  switch (tracking.state) {
    case 'IN_PROGRESS':
      return 'You\'re in the chair'
    case 'YOU_ARE_NEXT':
      return 'You\'re next'
    default:
      return `You're #${tracking.position}`
  }
}

function queueDetail(visit: Extract<RecentVisit, { kind: 'queue' }>) {
  const { tracking } = visit
  if (tracking.state === 'IN_PROGRESS') {
    return tracking.serviceName
  }
  return `${formatWait(tracking.waitMinutes ?? 0)} wait · ${tracking.serviceName}`
}

function bookingWhen(visit: Extract<RecentVisit, { kind: 'booking' }>) {
  const { booking } = visit
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: booking.shop.timezone })
    .format(new Date(booking.startsAt))
  return `${day}, ${formatTime(booking.startsAt, booking.shop.timezone)}`
}
</script>

<template>
  <section
    aria-label="Where you left off"
    class="space-y-2"
  >
    <template
      v-for="visit in visits"
      :key="visit.code"
    >
      <!-- Live place in a queue -->
      <NuxtLink
        v-if="visit.kind === 'queue'"
        :to="`/queue/${visit.code}`"
        class="flex items-center gap-4 rounded-2xl bg-inverted p-4 text-inverted shadow-sm transition-transform active:scale-[0.99]"
      >
        <span class="grid size-11 shrink-0 place-items-center rounded-full bg-default/15">
          <UIcon
            name="i-lucide-ticket"
            class="size-5"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium opacity-70">{{ visit.tracking.shop.name }}</span>
          <span class="block text-lg font-semibold">{{ queueLine(visit) }}</span>
          <span class="block truncate text-sm opacity-80">{{ queueDetail(visit) }}</span>
        </span>
        <span class="flex items-center gap-1.5 text-xs font-medium opacity-80">
          <span class="size-2 animate-pulse rounded-full bg-success" />
          Live
        </span>
      </NuxtLink>

      <!-- Upcoming booking -->
      <NuxtLink
        v-else
        :to="`/booking/${visit.code}`"
        class="flex items-center gap-4 rounded-2xl bg-default p-4 shadow-sm ring-1 ring-default transition-transform active:scale-[0.99]"
      >
        <span class="grid size-11 shrink-0 place-items-center rounded-full bg-elevated">
          <UIcon
            name="i-lucide-calendar-check"
            class="size-5 text-highlighted"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-muted">{{ visit.booking.shop.name }}</span>
          <span class="block text-lg font-semibold text-highlighted">{{ bookingWhen(visit) }}</span>
          <span class="block truncate text-sm text-muted">
            {{ visit.booking.status === 'CHECKED_IN' ? 'Checked in' : visit.booking.serviceName }}
          </span>
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-5 text-dimmed"
        />
      </NuxtLink>
    </template>
  </section>
</template>
