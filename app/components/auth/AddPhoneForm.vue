<script setup lang="ts">
// Settings: add or change the signed-in account's mobile number. Step 1 the
// number, step 2 the code (which attaches it to this account).
const emit = defineEmits<{
  done: []
}>()

const phoneInput = ref('')
const phoneError = ref<string | null>(null)
const phoneNumber = ref<string | null>(null)
const sending = ref(false)
const errorMessage = ref<string | null>(null)

async function sendCode() {
  const normalized = toIndianMobileE164(phoneInput.value)
  if (!normalized) {
    phoneError.value = 'Enter your 10-digit mobile number.'
    return
  }
  phoneError.value = null
  errorMessage.value = null
  sending.value = true
  const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized })
  sending.value = false
  if (error) {
    errorMessage.value = authErrorMessage(error)
    return
  }
  phoneNumber.value = normalized
}
</script>

<template>
  <OtpCodeForm
    v-if="phoneNumber"
    :phone-number="phoneNumber"
    update-phone-number
    submit-label="Verify number"
    @verified="emit('done')"
    @change="phoneNumber = null"
  />

  <form
    v-else
    class="space-y-4"
    novalidate
    @submit.prevent="sendCode"
  >
    <div aria-live="polite">
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
    </div>
    <UFormField
      label="Mobile number"
      name="phone"
      :error="phoneError ?? undefined"
    >
      <UInput
        v-model="phoneInput"
        type="tel"
        inputmode="tel"
        autocomplete="tel-national"
        placeholder="98765 43210"
        size="xl"
        class="w-full"
        :disabled="sending"
        autofocus
      />
    </UFormField>
    <UButton
      type="submit"
      label="Send OTP"
      size="xl"
      block
      :loading="sending"
      :disabled="sending"
    />
  </form>
</template>
