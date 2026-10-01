<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ middleware: 'guest' })
useHead({ title: 'Sign in · Trimly' })

const route = useRoute()

const schema = z.object({
  // Phone keyboards add capitals and trailing spaces; emails are case-insensitive.
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password')
})

const state = reactive({ email: '', password: '' })
const submitting = ref(false)
const errorMessage = ref<string | null>(null)
const notice = ref<string | null>(route.query.reset === '1' ? 'Password changed. Sign in with your new password.' : null)

// Only same-site paths, so the login page can't be used to redirect elsewhere.
function redirectTarget(): string {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? redirect
    : '/dashboard'
}

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  submitting.value = true
  errorMessage.value = null
  notice.value = null

  const { error } = await authClient.signIn.email(event.data)
  if (error) {
    // Better Auth emails a fresh verification link on this attempt.
    errorMessage.value = error.code === 'EMAIL_NOT_VERIFIED'
      ? `Verify your email first. We've sent a new link to ${event.data.email}.`
      : error.status === 429
        ? 'Too many attempts. Wait a moment and try again.'
        : error.message ?? 'Could not sign in. Please try again.'
    submitting.value = false
    return
  }

  clearNuxtData()
  await navigateTo(redirectTarget())
}
</script>

<template>
  <AuthShell
    title="Sign in"
    description="Manage your shop's queue, bookings and payments."
  >
    <UAlert
      v-if="notice"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      :title="notice"
      class="mb-5"
    />
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mb-5"
    />

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
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
          autofocus
        />
      </UFormField>

      <UFormField
        label="Password"
        name="password"
      >
        <template #hint>
          <NuxtLink
            to="/forgot-password"
            class="text-muted hover:text-highlighted"
          >
            Forgot password?
          </NuxtLink>
        </template>
        <PasswordInput
          v-model="state.password"
          autocomplete="current-password"
        />
      </UFormField>

      <UButton
        type="submit"
        label="Sign in"
        size="xl"
        block
        :loading="submitting"
      />
    </UForm>

    <template #footer>
      New to Trimly?
      <NuxtLink
        to="/signup"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Create an account
      </NuxtLink>
    </template>
  </AuthShell>
</template>
