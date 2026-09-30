<script setup lang="ts">
import type { UpcomingAppointmentDto } from '#shared/types/queue'

const props = defineProps<{
  upcoming: UpcomingAppointmentDto[]
  timeZone: string
  /** When the queue was calculated, for "Late". */
  calculatedAt: string
  checkingIn: string | null
}>()

const emit = defineEmits<{
  'check-in': [appointmentId: string]
}>()

function isLate(appointment: UpcomingAppointmentDto) {
  return new Date(appointment.startsAt) < new Date(props.calculatedAt)
}
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-5' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
          Booked appointments
        </h2>
        <NuxtLink
          to="/dashboard/appointments"
          class="text-xs font-medium text-muted hover:text-highlighted"
        >
          All
        </NuxtLink>
      </div>
    </template>

    <ul class="divide-y divide-default">
      <li
        v-for="appointment in upcoming"
        :key="appointment.appointmentId ?? appointment.startsAt"
        class="flex items-center gap-3 px-4 py-3 sm:px-5"
      >
        <span class="w-16 shrink-0 font-semibold tabular-nums text-highlighted">
          {{ formatTime(appointment.startsAt, timeZone) }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 font-medium text-highlighted">
            <span class="truncate">{{ appointment.customerName }}</span>
            <UBadge
              v-if="isLate(appointment)"
              label="Late"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </p>
          <p class="truncate text-sm text-muted">
            {{ appointment.serviceName }}
          </p>
        </div>
        <UButton
          v-if="appointment.appointmentId"
          label="Check in"
          icon="i-lucide-log-in"
          variant="soft"
          :loading="checkingIn === appointment.appointmentId"
          :disabled="checkingIn !== null && checkingIn !== appointment.appointmentId"
          @click="emit('check-in', appointment.appointmentId)"
        />
      </li>
    </ul>
  </UCard>
</template>
