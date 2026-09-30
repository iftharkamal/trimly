<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ middleware: 'guest' })
useHead({ title: 'Sign in · Trimly' })

const route = useRoute()

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password')
})

const state = reactive({ email: '', password: '' })
const submitting = ref(false)
const errorMessage = ref<string | null>(null)

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

  const { error } = await authClient.signIn.email(event.data)
  if (error) {
    errorMessage.value = error.message ?? 'Could not sign in. Please try again.'
    submitting.value = false
    return
  }

  clearNuxtData()
  await navigateTo(redirectTarget())
}
</script>

<template>
  <div class="relative grid min-h-dvh place-items-center px-4">
    <UColorModeButton
      size="sm"
      class="absolute top-3 right-3"
    />
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-highlighted">
        <UIcon
          name="i-lucide-scissors"
          class="size-6 text-primary"
        />
        Trimly
      </div>

      <UCard :ui="{ body: 'p-6' }">
        <h1 class="text-xl font-semibold text-highlighted">
          Sign in
        </h1>
        <p class="mt-1 text-sm text-muted">
          Manage your shop's live queue.
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
          class="mt-5"
        />

        <UForm
          :schema="schema"
          :state="state"
          class="mt-5 space-y-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Email"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              autocomplete="email"
              size="lg"
              class="w-full"
              autofocus
            />
          </UFormField>

          <UFormField
            label="Password"
            name="password"
          >
            <UInput
              v-model="state.password"
              type="password"
              autocomplete="current-password"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            label="Sign in"
            size="lg"
            block
            :loading="submitting"
          />
        </UForm>
      </UCard>
    </div>
  </div>
</template>
