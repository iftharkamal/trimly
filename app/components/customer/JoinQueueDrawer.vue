<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { joinQueueBodySchema, phoneSchema, type JoinQueueBody } from '#shared/schemas/queue'
import type { ServiceDto } from '#shared/types/dashboard'
import type { CustomerQueueView } from '~/composables/usePublicQueue'

const props = defineProps<{
  shopName: string
  currency: string
  timeZone: string
  services: ServiceDto[]
  queue: CustomerQueueView
  /** Service tapped on the shop page, preselected in the form. */
  initialServiceId: string | null
  submitting: boolean
  errorMessage: string | null
  /** Link to the customer's existing place, when they're already in the queue. */
  existingPlaceUrl: string | null
}>()

const emit = defineEmits<{
  submit: [body: JoinQueueBody]
}>()

const open = defineModel<boolean>('open', { required: true })

const ANY_BARBER = 'any'

// Same rules as the API; online customers must give a phone number.
const formSchema = joinQueueBodySchema.extend({
  phone: phoneSchema,
  serviceId: z.uuid('Choose a service'),
  barberId: z.preprocess(value => (value === ANY_BARBER ? null : value), joinQueueBodySchema.shape.barberId)
})

function emptyState() {
  return {
    name: '',
    phone: '',
    serviceId: props.initialServiceId ?? undefined as string | undefined,
    barberId: ANY_BARBER
  }
}

const state = reactive(emptyState())

watch(open, (isOpen) => {
  if (isOpen) {
    // Keep what was typed if the drawer is reopened after an error.
    state.serviceId = props.initialServiceId ?? state.serviceId
  }
})

const activeBarbers = computed(() => props.queue.barbers.filter(lane => lane.barber.isActive))

const serviceItems = computed(() =>
  props.services.map(service => ({
    label: service.name,
    description: `${formatMinutes(service.durationMinutes)} · ${formatMoney(service.priceMinor, props.currency)}`,
    value: service.id
  }))
)

const barberItems = computed(() => [
  { label: 'Any barber (soonest)', value: ANY_BARBER },
  ...activeBarbers.value.map(lane => ({ label: lane.barber.name, value: lane.barber.id }))
])

const selectedService = computed(() => props.services.find(service => service.id === state.serviceId) ?? null)

// Server-calculated preview for the chosen barber, or for "any barber".
const preview = computed(() => {
  const barberId = state.barberId === ANY_BARBER ? props.queue.soonestBarberId : state.barberId
  return props.queue.barbers.find(lane => lane.barber.id === barberId)?.joinPreview ?? null
})

function onSubmit(event: FormSubmitEvent<z.output<typeof formSchema>>) {
  emit('submit', event.data)
}
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="`Join the queue at ${shopName}`"
    description="No account needed. We'll show your live place in line."
    :dismissible="!submitting"
    :ui="{ container: 'mx-auto w-full max-w-md', body: 'pb-2' }"
  >
    <template #body>
      <UForm
        id="join-queue-form"
        :schema="formSchema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
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
            :ui="{ fieldset: 'grid gap-2' }"
          />
        </UFormField>

        <UFormField
          label="Your name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="name"
            placeholder="So the barber can call you"
            size="xl"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Phone"
          name="phone"
          required
          help="Include your country code."
        >
          <UInput
            v-model="state.phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="+91 98765 43210"
            size="xl"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="activeBarbers.length > 1"
          label="Barber"
          name="barberId"
        >
          <USelect
            v-model="state.barberId"
            :items="barberItems"
            size="xl"
            class="w-full"
          />
        </UFormField>

        <!-- What they're signing up for, all from the server -->
        <div
          v-if="selectedService && preview"
          class="rounded-lg bg-elevated p-4"
        >
          <div class="flex items-baseline justify-between gap-3">
            <p class="font-medium text-highlighted">
              {{ selectedService.name }}
            </p>
            <p class="font-semibold tabular-nums text-highlighted">
              {{ formatMoney(selectedService.priceMinor, currency) }}
            </p>
          </div>
          <p class="text-sm text-muted">
            Takes about {{ formatMinutes(selectedService.durationMinutes) }}
          </p>

          <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-default pt-3 text-sm">
            <div>
              <dt class="text-muted">
                Your place
              </dt>
              <dd class="font-semibold tabular-nums text-highlighted">
                #{{ preview.position }}
                <span class="font-normal text-muted">
                  · {{ preview.customersAhead }} ahead
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Estimated wait
              </dt>
              <dd class="font-semibold tabular-nums text-highlighted">
                {{ preview.waitMinutes === 0 ? 'No wait' : formatWait(preview.waitMinutes) }}
              </dd>
            </div>
          </dl>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
          :actions="existingPlaceUrl
            ? [{ label: 'View my place', color: 'error', variant: 'outline', to: existingPlaceUrl }]
            : undefined"
        />
      </UForm>
    </template>

    <template #footer>
      <UButton
        type="submit"
        form="join-queue-form"
        label="Join queue"
        size="xl"
        block
        :loading="submitting"
        class="min-h-14 text-base font-semibold"
      />
    </template>
  </UDrawer>
</template>
