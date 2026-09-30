<script setup lang="ts">
import type { AppointmentDto } from '#shared/types/appointment'
import type { AppointmentAction } from '~/composables/useAppointments'

const props = defineProps<{
  appointments: AppointmentDto[]
  timeZone: string
  currency: string
  /** Current time, for "Late" (booked, time passed, not checked in). */
  now: Date
  pending: { id: string, action: AppointmentAction } | null
  /** Group under date headings (for multi-day lists). */
  showDates?: boolean
  showBarber?: boolean
  emptyText: string
}>()

const emit = defineEmits<{
  'check-in': [appointment: AppointmentDto]
  'cancel': [appointment: AppointmentDto]
  'no-show': [appointment: AppointmentDto]
}>()

const groups = computed(() => {
  const byDate = new Map<string, AppointmentDto[]>()
  for (const appointment of props.appointments) {
    const date = localDateOf(new Date(appointment.startsAt), props.timeZone)
    byDate.set(date, [...(byDate.get(date) ?? []), appointment])
  }
  return [...byDate.entries()].map(([date, items]) => ({ date, items }))
})

function dateHeading(date: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`))
}

function badge(appointment: AppointmentDto) {
  switch (appointment.status) {
    case 'BOOKED':
      return new Date(appointment.startsAt) < props.now
        ? { label: 'Late', color: 'warning' as const, icon: 'i-lucide-clock-alert' }
        : { label: 'Booked', color: 'neutral' as const, icon: 'i-lucide-calendar' }
    case 'CHECKED_IN':
      return { label: 'Checked in', color: 'success' as const, icon: 'i-lucide-circle-check' }
    case 'NO_SHOW':
      return { label: 'No-show', color: 'error' as const, icon: 'i-lucide-user-x' }
    default:
      return { label: 'Cancelled', color: 'neutral' as const, icon: 'i-lucide-circle-slash' }
  }
}

function isPending(appointment: AppointmentDto, action: AppointmentAction) {
  return props.pending?.id === appointment.id && props.pending.action === action
}
</script>

<template>
  <div
    v-if="!appointments.length"
    class="flex flex-col items-center px-6 py-12 text-center"
  >
    <UIcon
      name="i-lucide-calendar"
      class="size-8 text-dimmed"
    />
    <p class="mt-3 text-sm text-muted">
      {{ emptyText }}
    </p>
  </div>

  <div
    v-else
    class="divide-y divide-default"
  >
    <section
      v-for="group in groups"
      :key="group.date"
    >
      <h3
        v-if="showDates"
        class="bg-elevated/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted sm:px-5"
      >
        {{ dateHeading(group.date) }}
      </h3>
      <ul class="divide-y divide-default">
        <li
          v-for="appointment in group.items"
          :key="appointment.id"
          class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-5"
          :class="appointment.status === 'CANCELLED' ? 'opacity-60' : ''"
        >
          <div class="w-20 shrink-0">
            <p class="font-semibold tabular-nums text-highlighted">
              {{ formatTime(appointment.startsAt, timeZone) }}
            </p>
            <p class="text-xs tabular-nums text-muted">
              to {{ formatTime(appointment.endsAt, timeZone) }}
            </p>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate font-medium text-highlighted">
                {{ appointment.customer.name }}
              </p>
              <UBadge
                v-bind="badge(appointment)"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="appointment.source === 'ONLINE'"
                label="Online"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </div>
            <p class="mt-0.5 text-sm text-muted">
              {{ appointment.serviceName }} · {{ formatMinutes(appointment.durationMinutes) }} ·
              {{ formatMoney(appointment.priceMinor, currency) }}<template v-if="showBarber">
                · {{ appointment.barber.name }}
              </template>
            </p>
            <a
              v-if="appointment.customer.phone"
              :href="`tel:${appointment.customer.phone}`"
              class="mt-0.5 inline-block text-sm text-muted underline-offset-2 hover:underline"
            >{{ appointment.customer.phone }}</a>
          </div>

          <div
            v-if="appointment.status === 'BOOKED'"
            class="flex items-center gap-2"
          >
            <UButton
              label="Check in"
              icon="i-lucide-log-in"
              :loading="isPending(appointment, 'check-in')"
              :disabled="pending !== null && !isPending(appointment, 'check-in')"
              class="flex-1 justify-center sm:flex-none"
              @click="emit('check-in', appointment)"
            />
            <UButton
              label="No-show"
              icon="i-lucide-user-x"
              color="neutral"
              variant="ghost"
              :loading="isPending(appointment, 'no-show')"
              :disabled="pending !== null && !isPending(appointment, 'no-show')"
              @click="emit('no-show', appointment)"
            />
            <UButton
              label="Cancel"
              icon="i-lucide-x"
              color="error"
              variant="ghost"
              :loading="isPending(appointment, 'cancel')"
              :disabled="pending !== null && !isPending(appointment, 'cancel')"
              @click="emit('cancel', appointment)"
            />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
