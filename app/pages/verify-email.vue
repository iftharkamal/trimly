<script setup lang="ts">
import { z } from 'zod'

// Better Auth sends people here after the verification link: signed in on
// success, or with ?error=… when the link is invalid or expired.
useHead({ title: 'Verify your email · Trimly' })

const route = useRoute()
const failed = computed(() => typeof route.query.error === 'string')

const email = ref('')
const sending = ref(false)
const sent = ref(false)
const emailError = ref<string | null>(null)

async function resend() {
  const parsed = z.string().trim().toLowerCase().pipe(z.email()).safeParse(email.value)
  if (!parsed.success) {
    emailError.value = 'Enter a valid email address'
    return
  }
  emailError.value = null
  sending.value = true
  await authClient.sendVerificationEmail({ email: parsed.data, callbackURL: '/verify-email' })
  sending.value = false
  sent.value = true
}
</script>

<template>
  <AuthShell
    v-if="!failed"
    title="Email verified"
    description="You're signed in. Next, set up your shop."
  >
    <UButton
      to="/onboarding"
      label="Set up your shop"
      trailing-icon="i-lucide-arrow-right"
      size="xl"
      block
    />
  </AuthShell>

  <AuthShell
    v-else
    title="This link didn't work"
    description="It may have expired (links work for 1 hour) or been used already. We can send a new one."
  >
    <div
      v-if="sent"
      class="rounded-xl bg-elevated p-4 text-sm text-muted"
    >
      If {{ email }} has an account waiting for verification, a new link is on its way.
    </div>
    <form
      v-else
      class="space-y-4"
      @submit.prevent="resend"
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
        />
      </UFormField>
      <UButton
        type="submit"
        label="Send a new link"
        size="xl"
        block
        :loading="sending"
      />
    </form>

    <template #footer>
      <NuxtLink
        to="/login"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
