<script setup lang="ts">
// Reached from the reset email: Better Auth redirects here with ?token=…,
// or ?error=… if the link is invalid or expired.
useHead({ title: 'Choose a new password · Trimly' })

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : null))

const password = ref('')
const passwordError = ref<string | null>(null)
const saving = ref(false)
const errorMessage = ref<string | null>(null)

async function onSubmit() {
  if (password.value.length < 8) {
    passwordError.value = 'Use at least 8 characters'
    return
  }
  if (!token.value) {
    return
  }
  passwordError.value = null
  saving.value = true
  const { error } = await authClient.resetPassword({ newPassword: password.value, token: token.value })
  saving.value = false
  if (error) {
    errorMessage.value = error.code === 'INVALID_TOKEN'
      ? 'This link has expired or was already used. Ask for a new one.'
      : error.message ?? 'Could not change your password. Please try again.'
    return
  }
  await navigateTo({ path: '/auth/login', query: { reset: '1' } })
}
</script>

<template>
  <AuthShell
    v-if="!token"
    title="This link didn't work"
    description="It may have expired (links work for 1 hour) or been used already."
  >
    <UButton
      to="/forgot-password"
      label="Get a new link"
      size="xl"
      block
    />
  </AuthShell>

  <AuthShell
    v-else
    title="Choose a new password"
    description="You'll be signed out on your other devices."
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      :actions="[{ label: 'Get a new link', color: 'error', variant: 'outline', to: '/forgot-password' }]"
      class="mb-5"
    />

    <form
      class="space-y-4"
      @submit.prevent="onSubmit"
    >
      <UFormField
        label="New password"
        help="At least 8 characters."
        :error="passwordError ?? undefined"
      >
        <PasswordInput
          v-model="password"
          autocomplete="new-password"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Save new password"
        size="xl"
        block
        :loading="saving"
      />
    </form>
  </AuthShell>
</template>
