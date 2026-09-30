<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { CreateAppointmentBody } from '#shared/schemas/appointment'
import { phoneSchema } from '#shared/schemas/queue'
import type { AppointmentDto } from '#shared/types/appointment'
import type { ServiceDto } from '#shared/types/dashboard'
import type { ApiSuccess } from '#shared/types/queue'

const props = defineProps<{
  services: ServiceDto[]
  barbers: { id: string, name: string }[]
  currency: string
  timeZone: string
  /** Preselected date ("YYYY-MM-DD"), e.g. the calendar's selected day. */
  initialDate: string
  submitting: boolean
}>()

const emit = defineEmits<{
  submit: [body: CreateAppointmentBody]
}>()

const open = defineModel<boolean>('open', { required: true })

const ANY_BARBER = 'any'
const QUARTER_HOUR_MS = 15 * 60_000

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  phone: z.preprocess(value => (typeof value === 'string' && value.trim() === '' ? null : value), phoneSchema.nullable()),
  serviceId: z.uuid('Choose a service'),
  barberId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time')
})

/** The next quarter hour at least 15 minutes from now, in shop time. */
function suggestedStart() {
  const soon = new Date(Math.ceil((Date.now() + QUARTER_HOUR_MS) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS)
  return { date: localDateOf(soon, props.timeZone), time: localTimeOf(soon, props.timeZone) }
}

function emptyState() {
  const soon = suggestedStart()
  const date = props.initialDate > soon.date ? props.initialDate : soon.date
  return {
    name: '',
    phone: '',
    serviceId: undefined as string | undefined,
    barberId: ANY_BARBER,
    date,
    time: date === soon.date ? soon.time : '10:00'
  }
}

const state = reactive(emptyState())
const formError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    Object.assign(state, emptyState())
    formError.value = null
  }
})

const serviceItems = computed(() =>
  props.services.map(service => ({
    label: service.name,
    description: `${formatMinutes(service.durationMinutes)} · ${formatMoney(service.priceMinor, props.currency)}`,
    value: service.id
  }))
)

const barberItems = computed(() => [
  { label: 'Any barber', value: ANY_BARBER },
  ...props.barbers.map(barber => ({ label: barber.name, value: barber.id }))
])

// What's already booked that day, so the barber can pick a free time.
const dayQuery = computed(() => ({ from: state.date, to: addLocalDays(state.date, 1) }))
const { data: dayAppointments } = useLazyFetch<ApiSuccess<AppointmentDto[]>>('/api/dashboard/appointments', {
  query: dayQuery,
  server: false,
  immediate: false,
  watch: [dayQuery, open]
})

const bookedThatDay = computed(() =>
  (open.value ? dayAppointments.value?.data ?? [] : [])
    .filter(appointment => appointment.status === 'BOOKED' || appointment.status === 'CHECKED_IN')
    .filter(appointment => state.barberId === ANY_BARBER || appointment.barber.id === state.barberId)
)

function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  const startsAt = zonedTimeToUtc(event.data.date, event.data.time, props.timeZone)
  if (startsAt.getTime() <= Date.now()) {
    formError.value = 'Choose a time in the future.'
    return
  }
  formError.value = null
  emit('submit', {
    customer: { name: event.data.name, phone: event.data.phone },
    serviceId: event.data.serviceId,
    barberId: event.data.barberId === ANY_BARBER ? null : event.data.barberId,
    startsAt: startsAt.toISOString()
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Book appointment"
    description="Times are in shop time."
    :dismissible="!submitting"
  >
    <template #body>
      <UForm
        id="book-appointment-form"
        :schema="schema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <div class="grid grid-cols-2 gap-3">
          <UFormField
            label="Date"
            name="date"
            required
          >
            <UInput
              v-model="state.date"
              type="date"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Time"
            name="time"
            required
          >
            <UInput
              v-model="state.time"
              type="time"
              step="300"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>

        <div
          v-if="bookedThatDay.length"
          class="rounded-lg bg-elevated px-3 py-2 text-sm"
        >
          <p class="font-medium text-highlighted">
            Already booked that day
          </p>
          <ul class="mt-1 space-y-0.5 text-muted">
            <li
              v-for="appointment in bookedThatDay"
              :key="appointment.id"
              class="tabular-nums"
            >
              {{ formatTime(appointment.startsAt, timeZone) }}–{{ formatTime(appointment.endsAt, timeZone) }}
              · {{ appointment.customer.name }}<template v-if="barbers.length > 1">
                ({{ appointment.barber.name }})
              </template>
            </li>
          </ul>
        </div>

        <UFormField
          label="Service"
          name="serviceId"
          required
        >
          <URadioGroup
            v-model="state.serviceId"
            :items="serviceItems"
            variant="card"
            indicator="hidden"
            :ui="{ fieldset: 'grid gap-2 sm:grid-cols-3' }"
          />
        </UFormField>

        <UFormField
          label="Customer name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="off"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Phone"
          name="phone"
          hint="Optional"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            inputmode="tel"
            placeholder="+91 98765 43210"
            autocomplete="off"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="barbers.length > 1"
          label="Barber"
          name="barberId"
        >
          <USelect
            v-model="state.barberId"
            :items="barberItems"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="formError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="formError"
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="submitting"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="book-appointment-form"
          label="Book"
          icon="i-lucide-calendar-check"
          :loading="submitting"
        />
      </div>
    </template>
  </UModal>
</template>
