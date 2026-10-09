<script setup lang="ts">
// First-time setup: a signed-in user without a shop creates one and becomes
// its OWNER. People who already belong to a shop never see this (the auth
// middleware sends them to the dashboard). The server does the real work and
// checks: one transaction, one shop per person, input validated again.
import type { Form, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createShopBodySchema } from '#shared/schemas/onboarding'
import type { ApiErrorBody, ApiSuccess } from '#shared/types/queue'
import type { ShopProfileDto } from '#shared/types/shop'

definePageMeta({ middleware: 'auth', shop: 'none' })
useHead({ title: 'Set up your shop · Trimly' })

const { contact, signingOut, signOut } = useCurrentUser()

// The form's fields; the timezone comes from the browser, not a field.
const formSchema = createShopBodySchema.omit({ timezone: true })
type FormOutput = z.output<typeof formSchema>

const form = useTemplateRef<Form<typeof formSchema>>('form')
const state = reactive({ name: '', phone: '', address: '', currency: 'INR' })
const currencies = Intl.supportedValuesOf('currency')

const creating = ref(false)
const errorMessage = ref<string | null>(null)
const created = ref<ShopProfileDto | null>(null)

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  }
  catch {
    return undefined
  }
}

async function goToDashboard() {
  clearNuxtData()
  await navigateTo('/dashboard')
}

async function onSubmit(event: FormSubmitEvent<FormOutput>) {
  if (creating.value) {
    return
  }
  creating.value = true
  errorMessage.value = null
  try {
    const { data } = await $fetch<ApiSuccess<ShopProfileDto>>('/api/onboarding/shop', {
      method: 'POST',
      body: { ...event.data, address: event.data.address || undefined, timezone: browserTimeZone() }
    })
    created.value = data
    await goToDashboard()
  }
  catch (caught) {
    const body = (caught as { data?: Partial<ApiErrorBody> }).data
    const code = body?.error?.code
    if (code === 'ALREADY_HAS_SHOP') {
      // Created already (e.g. by a repeated request): carry on.
      await goToDashboard()
      return
    }
    if (code === 'VALIDATION_ERROR' && body?.error?.details?.length) {
      // The server checks too; show its messages on the fields.
      form.value?.setErrors(body.error.details.map(detail => ({ name: detail.path, message: detail.message })))
    }
    else {
      errorMessage.value = getApiErrorMessage(caught)
    }
    creating.value = false
  }
}
</script>

<template>
  <AuthShell
    :title="created ? 'Your shop is ready' : 'Welcome to Trimly 👋'"
    :description="created ? undefined : 'Let\'s set up your barber shop.'"
  >
    <AuthSuccess
      v-if="created"
      :message="`${created.name} is set up. Taking you to your dashboard…`"
    />

    <template v-else>
      <div aria-live="polite">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="We couldn't create your shop"
          :description="errorMessage"
          class="mb-5"
        />
      </div>

      <UForm
        ref="form"
        :schema="formSchema"
        :state="state"
        :disabled="creating"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UFormField
          label="Shop name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="organization"
            placeholder="e.g. Faisal Barber"
            size="xl"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField
          label="Phone"
          name="phone"
          help="Customers can call this number."
          required
        >
          <UInput
            v-model="state.phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="98765 43210"
            size="xl"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Address"
          name="address"
          hint="Optional"
        >
          <UTextarea
            v-model="state.address"
            autocomplete="street-address"
            placeholder="Shop no., street, area, city"
            :rows="2"
            autoresize
            size="xl"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Currency"
          name="currency"
          required
        >
          <USelectMenu
            v-model="state.currency"
            :items="currencies"
            size="xl"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Create Shop"
          trailing-icon="i-lucide-arrow-right"
          size="xl"
          block
          :loading="creating"
          :disabled="creating"
        />
      </UForm>
    </template>

    <template
      v-if="!created"
      #footer
    >
      <span class="break-all">Signed in as {{ contact }}</span>
      ·
      <button
        type="button"
        class="font-medium text-highlighted underline-offset-2 hover:underline disabled:opacity-50"
        :disabled="signingOut || creating"
        @click="signOut"
      >
        Sign out
      </button>
    </template>
  </AuthShell>
</template>
