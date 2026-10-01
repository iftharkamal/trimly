<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { joinQueueBodySchema, type JoinQueueBody } from '#shared/schemas/queue'

const props = defineProps<{
  shopId: string
  currency: string
  barbers: { id: string, name: string }[]
  submitting: boolean
}>()

const emit = defineEmits<{
  submit: [body: JoinQueueBody]
}>()

const open = defineModel<boolean>('open', { required: true })

const ANY_BARBER = 'any'

// The API schema, adapted to form inputs: an empty phone means "no phone",
// and the barber select uses a sentinel for "any barber".
const formSchema = joinQueueBodySchema.extend({
  phone: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? null : value),
    joinQueueBodySchema.shape.phone
  ),
  serviceId: z.uuid('Choose a service'),
  barberId: z.preprocess(
    value => (value === ANY_BARBER ? null : value),
    joinQueueBodySchema.shape.barberId
  )
})

function emptyState() {
  return { name: '', phone: '', serviceId: undefined as string | undefined, barberId: ANY_BARBER }
}

const state = reactive(emptyState())

const { data: services, status: servicesStatus, error: servicesError, execute: loadServices } = useLazyFetch(
  () => `/api/shops/${props.shopId}/services`,
  { immediate: false, server: false, transform: response => response.data }
)

const serviceItems = computed(() =>
  (services.value ?? []).map(service => ({
    label: service.name,
    description: `${formatMinutes(service.durationMinutes)} · ${formatMoney(service.priceMinor, props.currency)}`,
    value: service.id
  }))
)

const barberItems = computed(() => [
  { label: 'Any barber (soonest)', value: ANY_BARBER },
  ...props.barbers.map(barber => ({ label: barber.name, value: barber.id }))
])

watch(open, (isOpen) => {
  if (isOpen) {
    Object.assign(state, emptyState())
    if (!services.value) {
      loadServices()
    }
  }
})

function onSubmit(event: FormSubmitEvent<z.output<typeof formSchema>>) {
  emit('submit', event.data)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Add customer"
    description="Walk-ins join at the end of the queue."
    :dismissible="!submitting"
  >
    <template #body>
      <UAlert
        v-if="servicesError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Couldn't load services"
        :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: () => loadServices() }]"
      />

      <UForm
        v-else
        id="add-customer-form"
        :schema="formSchema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            placeholder="Customer name"
            autocomplete="off"
            size="lg"
            class="w-full"
            autofocus
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
            placeholder="+91 98765 43210"
            autocomplete="off"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Service"
          name="serviceId"
          required
        >
          <div
            v-if="servicesStatus === 'pending' || servicesStatus === 'idle'"
            class="grid gap-2 sm:grid-cols-3"
          >
            <USkeleton
              v-for="n in 3"
              :key="n"
              class="h-16"
            />
          </div>
          <p
            v-else-if="!serviceItems.length"
            class="text-sm text-muted"
          >
            No active services yet.
            <ULink
              to="/dashboard/services"
              class="font-medium text-highlighted underline underline-offset-4"
            >
              Add a service
            </ULink>
            to start taking customers.
          </p>
          <URadioGroup
            v-else
            v-model="state.serviceId"
            :items="serviceItems"
            variant="card"
            indicator="hidden"
            :ui="{ fieldset: 'grid gap-2 sm:grid-cols-3' }"
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
          form="add-customer-form"
          label="Add to queue"
          icon="i-lucide-user-plus"
          :loading="submitting"
          :disabled="!!servicesError || !serviceItems.length"
        />
      </div>
    </template>
  </UModal>
</template>
