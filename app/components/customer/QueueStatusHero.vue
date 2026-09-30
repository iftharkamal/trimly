<script setup lang="ts">
import type { QueueTrackingDto } from '#shared/types/queue'

const props = defineProps<{
  tracking: QueueTrackingDto
}>()

const timeZone = computed(() => props.tracking.shop.timezone)

const serviceWindow = computed(() => {
  const { estimatedStart, estimatedEnd } = props.tracking
  return estimatedStart && estimatedEnd ? formatTimeRange(estimatedStart, estimatedEnd, timeZone.value) : null
})

const aheadLabel = computed(() => {
  const ahead = props.tracking.customersAhead ?? 0
  if (ahead === 0) {
    return 'No one ahead of you'
  }
  return `${ahead} ${ahead === 1 ? 'customer' : 'customers'} ahead`
})

// Visual treatment per state; the state itself is decided by the server.
const look = computed(() => {
  switch (props.tracking.state) {
    case 'YOU_ARE_NEXT':
      return {
        card: 'bg-primary text-inverted ring-0',
        eyebrow: 'text-inverted/80',
        muted: 'text-inverted/80',
        icon: 'i-lucide-bell-ring',
        eyebrowText: 'Your turn is coming up'
      }
    case 'GETTING_CLOSE':
      return {
        card: 'bg-warning/10 ring-1 ring-warning/30',
        eyebrow: 'text-warning',
        muted: 'text-muted',
        icon: 'i-lucide-footprints',
        eyebrowText: 'Getting close — start heading over'
      }
    case 'IN_PROGRESS':
      return {
        card: 'bg-primary/10 ring-1 ring-primary/30',
        eyebrow: 'text-primary',
        muted: 'text-muted',
        icon: 'i-lucide-scissors',
        eyebrowText: 'In the chair'
      }
    case 'COMPLETED':
      return {
        card: 'bg-success/10 ring-1 ring-success/30',
        eyebrow: 'text-success',
        muted: 'text-muted',
        icon: 'i-lucide-circle-check',
        eyebrowText: 'Completed'
      }
    case 'CANCELLED':
      return {
        card: 'bg-elevated ring-1 ring-default',
        eyebrow: 'text-muted',
        muted: 'text-muted',
        icon: 'i-lucide-circle-x',
        eyebrowText: props.tracking.status === 'NO_SHOW' ? 'Place released' : 'Cancelled'
      }
    default:
      return {
        card: 'bg-default ring-1 ring-default',
        eyebrow: 'text-primary',
        muted: 'text-muted',
        icon: 'i-lucide-clock',
        eyebrowText: 'You\'re in the queue'
      }
  }
})

const isWaiting = computed(() => ['WAITING', 'GETTING_CLOSE', 'YOU_ARE_NEXT'].includes(props.tracking.state))
</script>

<template>
  <section
    class="rounded-2xl p-6 shadow-sm"
    :class="look.card"
    aria-live="polite"
  >
    <p
      class="flex items-center gap-2 text-sm font-semibold"
      :class="look.eyebrow"
    >
      <UIcon
        :name="look.icon"
        class="size-4"
      />
      {{ look.eyebrowText }}
    </p>

    <!-- Waiting, getting close, next -->
    <template v-if="isWaiting">
      <h1 class="mt-3 text-5xl font-bold tracking-tight tabular-nums">
        <template v-if="tracking.state === 'YOU_ARE_NEXT'">
          You're next!
        </template>
        <template v-else>
          You're #{{ tracking.position }}
        </template>
      </h1>
      <p
        class="mt-2 text-lg"
        :class="look.muted"
      >
        <template v-if="tracking.state === 'YOU_ARE_NEXT'">
          Please be at the shop. {{ aheadLabel }}.
        </template>
        <template v-else>
          {{ aheadLabel }}
        </template>
      </p>

      <dl class="mt-6 grid grid-cols-2 gap-4">
        <div>
          <dt
            class="text-sm"
            :class="look.muted"
          >
            Estimated wait
          </dt>
          <dd class="mt-0.5 text-2xl font-semibold tabular-nums">
            {{ formatWait(tracking.waitMinutes ?? 0) }}
          </dd>
        </div>
        <div v-if="serviceWindow">
          <dt
            class="text-sm"
            :class="look.muted"
          >
            Estimated service time
          </dt>
          <dd class="mt-0.5 text-2xl font-semibold tabular-nums">
            {{ serviceWindow }}
          </dd>
        </div>
      </dl>
    </template>

    <!-- In the chair -->
    <template v-else-if="tracking.state === 'IN_PROGRESS'">
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-highlighted">
        Enjoy your {{ tracking.serviceName.toLowerCase() }}
      </h1>
      <p
        v-if="tracking.estimatedEnd"
        class="mt-2 text-lg text-muted"
      >
        Estimated finish around {{ formatTime(tracking.estimatedEnd, timeZone) }}
      </p>
    </template>

    <!-- Completed -->
    <template v-else-if="tracking.state === 'COMPLETED'">
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-highlighted">
        All done, {{ tracking.customerName.split(' ')[0] }}!
      </h1>
      <p class="mt-2 text-lg text-muted">
        Thanks for visiting {{ tracking.shop.name }}.
      </p>
    </template>

    <!-- Cancelled or no-show -->
    <template v-else>
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-highlighted">
        {{ tracking.status === 'NO_SHOW' ? 'We missed you' : 'You\'re no longer in the queue' }}
      </h1>
      <p class="mt-2 text-lg text-muted">
        {{ tracking.status === 'NO_SHOW'
          ? 'Your place was released because you weren\'t at the shop when called.'
          : 'This place in the queue was cancelled.' }}
      </p>
    </template>
  </section>
</template>
