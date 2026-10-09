<script setup lang="ts">
// Name and "email or mobile". An email also needs a password and is verified
// by a link (/auth/verify); a mobile number is verified by a texted code.
definePageMeta({ middleware: 'guest' })

type Step = 'details' | 'code' | 'done'

const step = ref<Step>('details')
const name = ref('')
const identifierInput = ref('')
const password = ref('')
const errors = reactive<{ name?: string, identifier?: string, password?: string }>({})
const busy = ref(false)
const errorMessage = ref<string | null>(null)
const phoneNumber = ref('')
const doneMessage = ref('')

// The password field appears as soon as the input looks like an email.
const usingEmail = computed(() => looksLikeEmail(identifierInput.value))

const heading = computed(() => step.value === 'code'
  ? { title: 'Enter verification code' }
  : step.value === 'done'
    ? { title: 'You\'re in' }
    : { title: 'Create your account', description: 'Set up your barber shop in a couple of minutes.' })
useHead({ title: computed(() => `${heading.value.title} · Trimly`) })

function validate() {
  errors.name = name.value.trim() ? (name.value.trim().length > 60 ? 'Use 60 characters or fewer.' : undefined) : 'Enter your name.'
  const identifier = parseSignInIdentifier(identifierInput.value)
  errors.identifier = identifier
    ? undefined
    : usingEmail.value ? 'Enter a valid email address.' : 'Enter your email or 10-digit mobile number.'
  errors.password = identifier?.kind === 'email' && password.value.length < 8 ? 'Use at least 8 characters.' : undefined
  return errors.name || errors.identifier || errors.password ? null : identifier
}

async function onSubmit() {
  const identifier = validate()
  if (!identifier) {
    return
  }
  errorMessage.value = null
  busy.value = true

  if (identifier.kind === 'email') {
    // An existing email gets the same answer (no way to probe who has an account).
    const { error } = await authClient.signUp.email({
      name: name.value.trim(),
      email: identifier.email,
      password: password.value,
      callbackURL: '/auth/verify'
    })
    if (error) {
      busy.value = false
      errorMessage.value = authErrorMessage(error)
      return
    }
    await navigateTo({ path: '/auth/verify', query: { email: identifier.email } })
    return
  }

  const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: identifier.phoneNumber })
  busy.value = false
  if (error) {
    errorMessage.value = authErrorMessage(error)
    return
  }
  phoneNumber.value = identifier.phoneNumber
  step.value = 'code'
}

async function onVerified(user: { name: string }) {
  // New accounts are named after their number; an existing account keeps its name.
  const isNew = user.name === phoneNumber.value
  if (isNew) {
    await authClient.updateUser({ name: name.value.trim() })
  }
  doneMessage.value = isNew
    ? 'Account created. Taking you to set up your shop…'
    : 'This number already had an account, so we signed you in.'
  step.value = 'done'
  clearNuxtData()
  await navigateTo('/dashboard')
}

function backToDetails() {
  errorMessage.value = null
  step.value = 'details'
}
</script>

<template>
  <AuthShell
    :title="heading.title"
    :description="heading.description"
  >
    <div aria-live="polite">
      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorMessage"
        class="mb-5"
      />
    </div>

    <form
      v-if="step === 'details'"
      class="space-y-4"
      novalidate
      @submit.prevent="onSubmit"
    >
      <UFormField
        label="Name"
        name="name"
        :error="errors.name"
      >
        <UInput
          v-model="name"
          autocomplete="name"
          size="xl"
          class="w-full"
          :disabled="busy"
          autofocus
        />
      </UFormField>

      <UFormField
        label="Email or mobile number"
        name="identifier"
        :error="errors.identifier"
        :help="usingEmail ? undefined : 'With a mobile number, we\'ll text you a code instead of using a password.'"
      >
        <UInput
          v-model="identifierInput"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          placeholder="you@example.com or 98765 43210"
          size="xl"
          class="w-full"
          :disabled="busy"
        />
      </UFormField>

      <UFormField
        v-if="usingEmail"
        label="Password"
        name="password"
        :error="errors.password"
        help="At least 8 characters."
      >
        <PasswordInput
          v-model="password"
          autocomplete="new-password"
          :disabled="busy"
        />
      </UFormField>

      <UButton
        type="submit"
        :label="usingEmail || !identifierInput.trim() ? 'Create account' : 'Send OTP'"
        size="xl"
        block
        :loading="busy"
        :disabled="busy"
      />
    </form>

    <OtpCodeForm
      v-else-if="step === 'code'"
      :phone-number="phoneNumber"
      submit-label="Verify"
      @verified="onVerified"
      @change="backToDetails"
    />

    <AuthSuccess
      v-else
      :message="doneMessage"
    />

    <template
      v-if="step === 'details'"
      #footer
    >
      Already have an account?
      <NuxtLink
        to="/auth/login"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
