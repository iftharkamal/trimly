<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import type { CreateServiceBody } from '#shared/schemas/service'
import type { ManagedServiceDto } from '#shared/types/dashboard'

const props = defineProps<{
  /** Editing this service, or null to add a new one. */
  service: ManagedServiceDto | null
  currency: string
  saving: boolean
}>()

const emit = defineEmits<{
  save: [input: CreateServiceBody]
}>()

const open = defineModel<boolean>('open', { required: true })

// Price is typed in rupees (or the shop's currency), stored in minor units.
const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  durationMinutes: z.coerce.number<string>().int('Whole minutes').min(5, 'At least 5 minutes').max(480, 'At most 8 hours'),
  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a price, e.g. 150 or 150.50')
    .refine(price => Number(price) <= 100_000, 'At most 100,000')
})

const state = reactive({ name: '', durationMinutes: '20', price: '' })

watch(open, (isOpen) => {
  if (isOpen) {
    Object.assign(state, props.service
      ? { name: props.service.name, durationMinutes: String(props.service.durationMinutes), price: String(props.service.priceMinor / 100) }
      : { name: '', durationMinutes: '20', price: '' })
  }
})

function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  emit('save', {
    name: event.data.name,
    durationMinutes: event.data.durationMinutes,
    priceMinor: Math.round(Number(event.data.price) * 100)
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="service ? 'Edit service' : 'Add a service'"
    :description="service ? 'Changes apply to new joins and bookings.' : 'Customers choose from your services when they join or book.'"
    :dismissible="!saving"
  >
    <template #body>
      <UForm
        id="service-form"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            placeholder="e.g. Haircut"
            size="xl"
            class="w-full"
            autofocus
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField
            label="Duration"
            name="durationMinutes"
          >
            <UInput
              v-model="state.durationMinutes"
              type="number"
              inputmode="numeric"
              min="5"
              max="480"
              step="5"
              size="xl"
              class="w-full"
            >
              <template #trailing>
                <span class="text-sm text-muted">min</span>
              </template>
            </UInput>
          </UFormField>
          <UFormField
            label="Price"
            name="price"
          >
            <UInput
              v-model="state.price"
              inputmode="decimal"
              size="xl"
              class="w-full"
            >
              <template #leading>
                <span class="text-sm text-muted">{{ currencySymbol(currency) }}</span>
              </template>
            </UInput>
          </UFormField>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="service-form"
          :label="service ? 'Save changes' : 'Add service'"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
