<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ middleware: 'guest' })
useHead({ title: 'Create your account · Trimly' })

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(60),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(8, 'Use at least 8 characters').max(128)
})

const state = reactive({ name: '', email: '', password: '' })
const submitting = ref(false)
const errorMessage = ref<string | null>(null)
// After sign-up: "check your email".
const sentTo = ref<string | null>(null)
const resending = ref(false)
const resent = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  submitting.value = true
  errorMessage.value = null

  const { error } = await authClient.signUp.email({ ...event.data, callbackURL: '/verify-email' })
  submitting.value = false
  if (error) {
    errorMessage.value = error.code === 'USER_ALREADY_EXISTS' || error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
      ? 'An account with this email already exists. Sign in instead.'
      : error.status === 429
        ? 'Too many attempts. Wait a moment and try again.'
        : error.message ?? 'Could not create your account. Please try again.'
    return
  }
  sentTo.value = event.data.email
}

async function resend() {
  if (!sentTo.value) {
    return
  }
  resending.value = true
  await authClient.sendVerificationEmail({ email: sentTo.value, callbackURL: '/verify-email' })
  resending.value = false
  resent.value = true
}

// Phone sign-up is verified by the code itself: straight on to shop setup.
async function afterPhoneSignUp() {
  clearNuxtData()
  await navigateTo('/onboarding')
}

const methods = [
  { label: 'Email', icon: 'i-lucide-mail', slot: 'email' as const },
  { label: 'Phone', icon: 'i-lucide-smartphone', slot: 'phone' as const }
]
</script>

<template>
  <AuthShell
    v-if="sentTo"
    title="Check your email"
    :description="`We sent a link to ${sentTo}. Open it to verify your email and set up your shop.`"
  >
    <div class="rounded-xl bg-elevated p-4 text-sm text-muted">
      <p class="flex items-center gap-2 font-medium text-highlighted">
        <UIcon
          name="i-lucide-mail-check"
          class="size-4"
        />
        The link works for 1 hour
      </p>
      <p class="mt-1">
        Can't find it? Check your spam folder.
      </p>
    </div>

    <UButton
      :label="resent ? 'Sent again' : 'Send the link again'"
      :icon="resent ? 'i-lucide-check' : 'i-lucide-rotate-cw'"
      color="neutral"
      variant="outline"
      size="lg"
      block
      class="mt-4"
      :loading="resending"
      :disabled="resent"
      @click="resend"
    />

    <template #footer>
      <NuxtLink
        to="/login"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </template>
  </AuthShell>

  <AuthShell
    v-else
    title="Create your account"
    description="Set up your barber shop in a couple of minutes."
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mb-5"
    />

    <UTabs
      :items="methods"
      class="w-full"
      :ui="{ list: 'mb-5' }"
    >
      <template #phone>
        <PhoneOtpForm
          mode="sign-up"
          @done="afterPhoneSignUp"
        />
      </template>

      <template #email>
        <UForm
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Your name"
            name="name"
          >
            <UInput
              v-model="state.name"
              autocomplete="name"
              size="xl"
              class="w-full"
              autofocus
            />
          </UFormField>

          <UFormField
            label="Email"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Password"
            name="password"
            help="At least 8 characters."
          >
            <PasswordInput
              v-model="state.password"
              autocomplete="new-password"
            />
          </UFormField>

          <UButton
            type="submit"
            label="Create account"
            size="xl"
            block
            :loading="submitting"
          />
        </UForm>
      </template>
    </UTabs>

    <template #footer>
      Already have an account?
      <NuxtLink
        to="/login"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
