<script setup lang="ts">
// One field first ("email or mobile number"), then the matching method:
// email → password; mobile → send a code → enter it. A mobile number with no
// account yet gets one (Better Auth creates it on verification), and is asked
// for a name.
definePageMeta({ middleware: 'guest' })

type Step = 'identifier' | 'password' | 'phone' | 'code' | 'name' | 'done'

const route = useRoute()
const step = ref<Step>('identifier')

const identifierInput = ref('')
const identifierError = ref<string | null>(null)
const email = ref('')
const password = ref('')
const passwordError = ref<string | null>(null)
const phoneInput = ref('')
const phoneError = ref<string | null>(null)
const phoneNumber = ref('')
const name = ref('')
const nameError = ref<string | null>(null)

const busy = ref(false)
const errorMessage = ref<string | null>(null)
const notice = ref<string | null>(route.query.reset === '1' ? 'Password changed. Sign in with your new password.' : null)
const doneMessage = ref('')

const titles: Record<Step, { title: string, description?: string }> = {
  identifier: { title: 'Welcome back', description: 'Sign in to manage your shop\'s queue, bookings and payments.' },
  password: { title: 'Enter your password' },
  phone: { title: 'Sign in with your mobile', description: 'We\'ll text you a code. No password needed.' },
  code: { title: 'Enter verification code' },
  name: { title: 'Welcome to Trimly', description: 'You\'re new here. What should we call you?' },
  done: { title: 'You\'re signed in' }
}
const heading = computed(() => titles[step.value])
useHead({ title: computed(() => `${heading.value.title} · Trimly`) })

function goTo(next: Step) {
  errorMessage.value = null
  step.value = next
}

function onContinue() {
  notice.value = null
  const identifier = parseSignInIdentifier(identifierInput.value)
  if (!identifier) {
    identifierError.value = looksLikeEmail(identifierInput.value)
      ? 'Enter a valid email address.'
      : 'Enter your email or 10-digit mobile number.'
    return
  }
  identifierError.value = null
  if (identifier.kind === 'email') {
    email.value = identifier.email
    goTo('password')
  }
  else {
    phoneInput.value = formatIndianMobile(identifier.phoneNumber)
    goTo('phone')
  }
}

async function finish(message: string) {
  doneMessage.value = message
  goTo('done')
  clearNuxtData()
  await navigateTo(safeRedirect(route.query.redirect))
}

async function onLogin() {
  if (!password.value) {
    passwordError.value = 'Enter your password.'
    return
  }
  passwordError.value = null
  errorMessage.value = null
  busy.value = true
  const { error } = await authClient.signIn.email({ email: email.value, password: password.value })
  busy.value = false
  if (error) {
    // Better Auth emails a fresh verification link on this attempt.
    errorMessage.value = error.code === 'EMAIL_NOT_VERIFIED'
      ? `Verify your email first. We've sent a new link to ${email.value}.`
      : authErrorMessage(error)
    return
  }
  await finish('Taking you to your dashboard…')
}

async function onSendCode() {
  const normalized = toIndianMobileE164(phoneInput.value)
  if (!normalized) {
    phoneError.value = 'Enter your 10-digit mobile number.'
    return
  }
  phoneError.value = null
  errorMessage.value = null
  busy.value = true
  const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized })
  busy.value = false
  if (error) {
    errorMessage.value = authErrorMessage(error)
    return
  }
  phoneNumber.value = normalized
  goTo('code')
}

async function onVerified(user: { name: string }) {
  // A new account is named after its number until it has a real name.
  if (user.name === phoneNumber.value) {
    goTo('name')
    return
  }
  await finish('Taking you to your dashboard…')
}

async function onSaveName() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = 'Enter your name.'
    return
  }
  if (trimmed.length > 60) {
    nameError.value = 'Use 60 characters or fewer.'
    return
  }
  nameError.value = null
  errorMessage.value = null
  busy.value = true
  const { error } = await authClient.updateUser({ name: trimmed })
  busy.value = false
  if (error) {
    errorMessage.value = authErrorMessage(error)
    return
  }
  await finish('Account created. Taking you to set up your shop…')
}

function startOver() {
  password.value = ''
  goTo('identifier')
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
      <UAlert
        v-else-if="notice"
        color="success"
        variant="subtle"
        icon="i-lucide-circle-check"
        :title="notice"
        class="mb-5"
      />
    </div>

    <!-- 1. Email or mobile -->
    <form
      v-if="step === 'identifier'"
      class="space-y-4"
      novalidate
      @submit.prevent="onContinue"
    >
      <UFormField
        label="Email or mobile number"
        name="identifier"
        :error="identifierError ?? undefined"
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
          autofocus
        />
      </UFormField>
      <UButton
        type="submit"
        label="Continue"
        trailing-icon="i-lucide-arrow-right"
        size="xl"
        block
        :disabled="!identifierInput.trim()"
      />
    </form>

    <!-- 2a. Email: password -->
    <form
      v-else-if="step === 'password'"
      class="space-y-4"
      novalidate
      @submit.prevent="onLogin"
    >
      <UFormField label="Email">
        <div class="flex items-center justify-between gap-3 rounded-lg bg-elevated px-3 py-2.5">
          <span class="truncate text-sm font-medium text-highlighted">{{ email }}</span>
          <button
            type="button"
            class="shrink-0 text-sm font-medium text-muted underline-offset-2 hover:text-highlighted hover:underline"
            :disabled="busy"
            @click="startOver"
          >
            Change
          </button>
        </div>
        <!-- Lets password managers pair the saved password with this email. -->
        <input
          type="email"
          :value="email"
          autocomplete="username"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          readonly
        >
      </UFormField>

      <UFormField
        label="Password"
        name="password"
        :error="passwordError ?? undefined"
      >
        <template #hint>
          <NuxtLink
            :to="{ path: '/forgot-password', query: { email } }"
            class="text-muted hover:text-highlighted"
          >
            Forgot password?
          </NuxtLink>
        </template>
        <PasswordInput
          v-model="password"
          autocomplete="current-password"
          :disabled="busy"
        />
      </UFormField>

      <UButton
        type="submit"
        label="Login"
        size="xl"
        block
        :loading="busy"
        :disabled="busy"
      />
    </form>

    <!-- 2b. Mobile: send a code -->
    <form
      v-else-if="step === 'phone'"
      class="space-y-4"
      novalidate
      @submit.prevent="onSendCode"
    >
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
          size="xl"
          class="w-full"
          :disabled="busy"
          autofocus
        />
      </UFormField>
      <UButton
        type="submit"
        label="Send OTP"
        size="xl"
        block
        :loading="busy"
        :disabled="busy"
      />
      <button
        type="button"
        class="w-full text-center text-sm font-medium text-muted underline-offset-2 hover:text-highlighted hover:underline"
        :disabled="busy"
        @click="startOver"
      >
        Use an email instead
      </button>
    </form>

    <!-- 3. Code -->
    <OtpCodeForm
      v-else-if="step === 'code'"
      :phone-number="phoneNumber"
      @verified="onVerified"
      @change="goTo('phone')"
    />

    <!-- 4. New phone account: name -->
    <form
      v-else-if="step === 'name'"
      class="space-y-4"
      novalidate
      @submit.prevent="onSaveName"
    >
      <UFormField
        label="Your name"
        name="name"
        :error="nameError ?? undefined"
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
      <UButton
        type="submit"
        label="Continue"
        size="xl"
        block
        :loading="busy"
        :disabled="busy"
      />
    </form>

    <AuthSuccess
      v-else
      :message="doneMessage"
    />

    <template
      v-if="step === 'identifier'"
      #footer
    >
      New to Trimly?
      <NuxtLink
        to="/auth/signup"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Create an account
      </NuxtLink>
    </template>
  </AuthShell>
</template>
