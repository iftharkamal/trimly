<script setup lang="ts">
import type { PaymentMethod } from '#shared/constants'
import type { PaymentInput } from '#shared/schemas/payment'
import type { QueueEntryDto } from '#shared/types/queue'

const props = defineProps<{
  entry: QueueEntryDto | null
  currency: string
  /** What is being submitted: a payment method, 'NONE' (no payment), or nothing. */
  submitting: PaymentMethod | 'NONE' | null
}>()

const emit = defineEmits<{
  complete: [payment: PaymentInput | null]
}>()

const open = defineModel<boolean>('open', { required: true })

const METHODS: { method: PaymentMethod, label: string, icon: string }[] = [
  { method: 'CASH', label: 'Cash', icon: 'i-lucide-banknote' },
  { method: 'UPI', label: 'UPI', icon: 'i-lucide-smartphone' },
  { method: 'CARD', label: 'Card', icon: 'i-lucide-credit-card' }
]

// Kept as text so the barber can type freely; prefilled with the service price.
const amountText = ref('')

function priceText(entry: QueueEntryDto) {
  return String(entry.priceMinor / 100)
}

watch(open, (isOpen) => {
  if (isOpen && props.entry) {
    amountText.value = priceText(props.entry)
  }
})

/** Minor units, or null if the input isn't a valid amount (at most 2 decimals). */
const amountMinor = computed(() => {
  const text = amountText.value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null
  }
  return Math.round(Number(text) * 100)
})

const isChanged = computed(() => props.entry !== null && amountMinor.value !== props.entry.priceMinor)
const isBusy = computed(() => props.submitting !== null)

function pay(method: PaymentMethod) {
  if (amountMinor.value === null) {
    return
  }
  emit('complete', { method, amountMinor: amountMinor.value })
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Take payment"
    :description="entry ? `${entry.customer.name} · ${entry.serviceName}` : undefined"
    :dismissible="!isBusy"
    :close="!isBusy"
  >
    <template #body>
      <div
        v-if="entry"
        class="space-y-6"
      >
        <UFormField
          label="Amount"
          :error="amountMinor === null ? 'Enter an amount, e.g. 150 or 150.50' : undefined"
        >
          <UInput
            v-model="amountText"
            inputmode="decimal"
            autocomplete="off"
            size="xl"
            class="w-full"
            :ui="{ base: 'text-2xl font-semibold tabular-nums' }"
            :disabled="isBusy"
          >
            <template #leading>
              <span class="text-lg text-muted">{{ currencySymbol(currency) }}</span>
            </template>
          </UInput>
          <template #help>
            <span v-if="isChanged">
              Service price {{ formatMoney(entry.priceMinor, currency) }}.
              <button
                type="button"
                class="font-medium text-highlighted underline underline-offset-2"
                :disabled="isBusy"
                @click="amountText = priceText(entry)"
              >
                Reset
              </button>
            </span>
          </template>
        </UFormField>

        <div>
          <p class="mb-2 text-sm font-medium text-highlighted">
            Paid with
          </p>
          <div class="grid grid-cols-3 gap-3">
            <UButton
              v-for="option in METHODS"
              :key="option.method"
              :icon="option.icon"
              :label="option.label"
              color="neutral"
              variant="outline"
              size="xl"
              :loading="submitting === option.method"
              :disabled="amountMinor === null || (isBusy && submitting !== option.method)"
              class="h-20 flex-col justify-center gap-1.5 text-base font-semibold"
              @click="pay(option.method)"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        label="Complete without payment"
        color="neutral"
        variant="link"
        :loading="submitting === 'NONE'"
        :disabled="isBusy && submitting !== 'NONE'"
        class="mx-auto"
        @click="emit('complete', null)"
      />
    </template>
  </UModal>
</template>
