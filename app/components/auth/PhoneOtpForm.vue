<script setup lang="ts">
// Sign in, sign up or add a phone number with a code texted to it. Step 1:
// the number (and a name, when signing up); step 2: the 6-digit code.
// The server decides everything; this only collects input.
const props = defineProps<{
  /** sign-in: an unknown number creates an account too. add: attach to the signed-in user. */
  mode: 'sign-in' | 'sign-up' | 'add'
}>()

const emit = defineEmits<{
  done: []
}>()

const RESEND_SECONDS = 30

const step = ref<'phone' | 'code'>('phone')
const phoneInput = ref('')
const name = ref('')
const code = ref('')
const phoneNumber = ref<string | null>(null)
const busy = ref(false)
const errorMessage = ref<string | null>(null)
const fieldError = ref<string | null>(null)
const resendIn = ref(0)
let resendTimer: ReturnType<typeof setInterval> | undefined

onBeforeUnmount(() => clearInterval(resendTimer))

function startResendCountdown() {
  resendIn.value = RESEND_SECONDS
  clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendIn.value--
    if (resendIn.value <= 0) {
      clearInterval(resendTimer)
    }
  }, 1000)
}

function messageFor(error: { code?: string, message?: string, status: number }): string {
  switch (error.code) {
    case 'INVALID_PHONE_NUMBER':
      return 'Enter a valid Indian mobile number.'
    case 'INVALID_OTP':
      return 'That code isn\'t right. Check it and try again.'
    case 'OTP_EXPIRED':
    case 'OTP_NOT_FOUND':
      return 'This code has expired. Send a new one.'
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many wrong codes. Send a new one.'
    case 'PHONE_NUMBER_EXIST':
      return 'This number is already used by another Trimly account.'
    case 'TOO_MANY_CODES':
    case 'PHONE_SIGN_IN_UNAVAILABLE':
      return error.message ?? 'Please try again later.'
  }
  if (error.status === 429) {
    return 'Too many attempts. Wait a minute and try again.'
  }
  return error.message ?? 'Something went wrong. Please try again.'
}

async function sendCode() {
  errorMessage.value = null
  fieldError.value = null
  const normalized = toIndianMobileE164(phoneInput.value)
  if (!normalized) {
    fieldError.value = 'Enter your 10-digit mobile number'
    return
  }
  if (props.mode === 'sign-up' && !name.value.trim()) {
    fieldError.value = null
    errorMessage.value = 'Enter your name'
    return
  }

  busy.value = true
  const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized })
  busy.value = false
  if (error) {
    errorMessage.value = messageFor(error)
    return
  }
  phoneNumber.value = normalized
  code.value = ''
  step.value = 'code'
  startResendCountdown()
}

async function verifyCode() {
  if (!phoneNumber.value || busy.value) {
    return
  }
  errorMessage.value = null
  const digits = code.value.replace(/\D/g, '')
  if (digits.length !== 6) {
    errorMessage.value = 'Enter the 6-digit code'
    return
  }

  busy.value = true
  const { data, error } = await authClient.phoneNumber.verify({
    phoneNumber: phoneNumber.value,
    code: digits,
    ...(props.mode === 'add' ? { updatePhoneNumber: true } : {})
  })
  if (error) {
    busy.value = false
    errorMessage.value = messageFor(error)
    return
  }

  // A new phone account is named after its number until it has a real name.
  const newName = name.value.trim()
  if (props.mode === 'sign-up' && newName && data?.user.name === phoneNumber.value) {
    await authClient.updateUser({ name: newName })
  }
  busy.value = false
  emit('done')
}

// Submit as soon as the code is complete (SMS autofill fills all 6 at once).
watch(code, (value) => {
  if (value.replace(/\D/g, '').length === 6) {
    verifyCode()
  }
})

function changeNumber() {
  step.value = 'phone'
  errorMessage.value = null
  code.value = ''
}
</script>

<template>
  <div>
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mb-5"
    />

    <form
      v-if="step === 'phone'"
      class="space-y-4"
      @submit.prevent="sendCode"
    >
      <UFormField
        v-if="mode === 'sign-up'"
        label="Your name"
      >
        <UInput
          v-model="name"
          autocomplete="name"
          size="xl"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="Mobile number"
        :error="fieldError ?? undefined"
        :help="mode === 'sign-in' ? 'New number? We\'ll create your account.' : undefined"
      >
        <UInput
          v-model="phoneInput"
          type="tel"
          inputmode="tel"
          autocomplete="tel-national"
          placeholder="98765 43210"
          size="xl"
          class="w-full"
          :ui="{ base: 'ps-12' }"
        >
          <template #leading>
            <span class="text-sm text-muted">+91</span>
          </template>
        </UInput>
      </UFormField>

      <UButton
        type="submit"
        label="Send code"
        size="xl"
        block
        :loading="busy"
      />
    </form>

    <form
      v-else
      class="space-y-4"
      @submit.prevent="verifyCode"
    >
      <p class="text-sm text-muted">
        We texted a 6-digit code to
        <span class="font-medium text-highlighted">{{ formatIndianMobile(phoneNumber ?? '') }}</span>.
        <button
          type="button"
          class="font-medium text-highlighted underline-offset-2 hover:underline"
          @click="changeNumber"
        >
          Change
        </button>
      </p>

      <UFormField label="Code">
        <UInput
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="••••••"
          size="xl"
          class="w-full"
          :ui="{ base: 'text-center text-2xl tracking-[0.5em] font-semibold' }"
          autofocus
        />
      </UFormField>

      <UButton
        type="submit"
        :label="mode === 'add' ? 'Verify number' : 'Continue'"
        size="xl"
        block
        :loading="busy"
      />

      <UButton
        :label="resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'"
        color="neutral"
        variant="ghost"
        size="lg"
        block
        :disabled="resendIn > 0 || busy"
        @click="sendCode"
      />
    </form>
  </div>
</template>
