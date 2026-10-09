<script setup lang="ts">
// Step 2 of every phone flow: enter the code texted to `phoneNumber`, with
// resend after a short wait. The parent has already sent the first code.
const props = defineProps<{
  phoneNumber: string
  /** Attach the number to the signed-in account instead of signing in with it. */
  updatePhoneNumber?: boolean
  submitLabel?: string
}>()

const emit = defineEmits<{
  verified: [user: { id: string, name: string }]
  change: []
}>()

const RESEND_SECONDS = 30

const code = ref('')
const verifying = ref(false)
const resending = ref(false)
const errorMessage = ref<string | null>(null)
const notice = ref<string | null>(`We sent a 6-digit code to ${formatIndianMobile(props.phoneNumber)}.`)
const resendIn = ref(RESEND_SECONDS)
let timer: ReturnType<typeof setInterval> | undefined

function startCountdown() {
  resendIn.value = RESEND_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    resendIn.value = Math.max(0, resendIn.value - 1)
    if (resendIn.value === 0) {
      clearInterval(timer)
    }
  }, 1000)
}
onMounted(startCountdown)
onBeforeUnmount(() => clearInterval(timer))

const digits = computed(() => code.value.replace(/\D/g, ''))

async function verify() {
  if (verifying.value) {
    return
  }
  errorMessage.value = null
  if (digits.value.length !== 6) {
    errorMessage.value = 'Enter the 6-digit code.'
    return
  }
  verifying.value = true
  const { data, error } = await authClient.phoneNumber.verify({
    phoneNumber: props.phoneNumber,
    code: digits.value,
    ...(props.updatePhoneNumber ? { updatePhoneNumber: true } : {})
  })
  if (error || !data) {
    verifying.value = false
    errorMessage.value = error ? authErrorMessage(error) : 'Something went wrong. Please try again.'
    return
  }
  // Stays "verifying" while the parent moves on.
  emit('verified', { id: data.user.id, name: data.user.name })
}

async function resend() {
  errorMessage.value = null
  notice.value = null
  resending.value = true
  const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: props.phoneNumber })
  resending.value = false
  if (error) {
    errorMessage.value = authErrorMessage(error)
    return
  }
  code.value = ''
  notice.value = `We sent a new code to ${formatIndianMobile(props.phoneNumber)}.`
  startCountdown()
}

// Submit as soon as the code is complete (SMS autofill fills all 6 at once).
watch(digits, (value) => {
  if (value.length === 6) {
    verify()
  }
})
</script>

<template>
  <form
    class="space-y-4"
    novalidate
    @submit.prevent="verify"
  >
    <div aria-live="polite">
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
      />
      <UAlert
        v-else-if="notice"
        color="success"
        variant="subtle"
        icon="i-lucide-message-square-text"
        :title="notice"
      />
    </div>

    <UFormField
      label="Verification code"
      name="code"
      help="It expires in 5 minutes."
    >
      <UInput
        v-model="code"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="7"
        placeholder="123456"
        size="xl"
        class="w-full"
        :ui="{ base: 'text-center text-2xl font-semibold tracking-[0.4em] placeholder:tracking-[0.4em]' }"
        :disabled="verifying"
        autofocus
      />
    </UFormField>

    <UButton
      type="submit"
      :label="submitLabel ?? 'Verify'"
      size="xl"
      block
      :loading="verifying"
      :disabled="verifying || digits.length !== 6"
    />

    <div class="flex items-center justify-between gap-3 text-sm">
      <button
        type="button"
        class="font-medium text-muted underline-offset-2 hover:text-highlighted hover:underline disabled:opacity-50"
        :disabled="verifying"
        @click="emit('change')"
      >
        Change number
      </button>
      <UButton
        :label="resendIn > 0 ? `Resend in ${resendIn}s` : 'Send a new code'"
        color="neutral"
        variant="ghost"
        size="sm"
        :loading="resending"
        :disabled="resendIn > 0 || resending || verifying"
        @click="resend"
      />
    </div>
  </form>
</template>
