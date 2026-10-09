<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ middleware: 'guest' })
useHead({ title: 'Forgot password · Trimly' })

const route = useRoute()
// Prefilled when coming from the sign-in page.
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const emailError = ref<string | null>(null)
const sending = ref(false)
const sent = ref(false)

async function onSubmit() {
  const parsed = z.string().trim().toLowerCase().pipe(z.email()).safeParse(email.value)
  if (!parsed.success) {
    emailError.value = 'Enter a valid email address'
    return
  }
  emailError.value = null
  sending.value = true
  // Same answer whether or not the account exists.
  await authClient.requestPasswordReset({ email: parsed.data, redirectTo: '/reset-password' })
  sending.value = false
  sent.value = true
}
</script>

<template>
  <AuthShell
    title="Reset your password"
    :description="sent ? undefined : 'Enter your email and we\'ll send you a link to choose a new password.'"
  >
    <div
      v-if="sent"
      class="rounded-xl bg-elevated p-4 text-sm text-muted"
    >
      <p class="flex items-center gap-2 font-medium text-highlighted">
        <UIcon
          name="i-lucide-mail-check"
          class="size-4"
        />
        Check your email
      </p>
      <p class="mt-1">
        If {{ email }} has an account, a reset link is on its way. It works for 1 hour.
      </p>
    </div>

    <form
      v-else
      class="space-y-4"
      @submit.prevent="onSubmit"
    >
      <UFormField
        label="Email"
        :error="emailError ?? undefined"
      >
        <UInput
          v-model="email"
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
      <UButton
        type="submit"
        label="Send reset link"
        size="xl"
        block
        :loading="sending"
      />
    </form>

    <template #footer>
      <NuxtLink
        to="/auth/login"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
