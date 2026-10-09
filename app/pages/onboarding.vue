<script setup lang="ts">
import { createShopBodySchema, type CreateShopBody } from '#shared/schemas/onboarding'
import type { SlugAvailabilityDto } from '#shared/types/account'
import type { ApiSuccess } from '#shared/types/queue'
import type { ShopProfileDto } from '#shared/types/shop'

definePageMeta({ middleware: 'auth', shop: 'none' })
useHead({ title: 'Set up your shop · Trimly' })

const { me, signingOut, signOut } = useCurrentUser()
const requestUrl = useRequestURL()

// India first; otherwise people pick their own.
function currencyFor(timeZone: string) {
  return timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta' ? 'INR' : ''
}

const supportedTimeZones = Intl.supportedValuesOf('timeZone')
// Browsers may report an alias (e.g. Asia/Calcutta) that the list leaves out.
const timeZones = computed(() => supportedTimeZones.includes(state.timezone) ? supportedTimeZones : [state.timezone, ...supportedTimeZones])
const currencies = Intl.supportedValuesOf('currency')

const state = reactive({
  name: '',
  slug: '',
  timezone: 'UTC',
  currency: '',
  barberName: me.value?.user.name ?? ''
})

onMounted(() => {
  // The browser knows the shop's likely timezone; the server render doesn't.
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (browserZone && isValidTimeZone(browserZone)) {
    state.timezone = browserZone
    state.currency ||= currencyFor(browserZone)
  }
})

// The link name follows the shop name until the owner edits it.
const slugEdited = ref(false)
watch(() => state.name, (name) => {
  if (!slugEdited.value) {
    state.slug = suggestSlug(name)
  }
})

const slugStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')
let slugTimer: ReturnType<typeof setTimeout> | undefined
watch(() => state.slug, (slug) => {
  clearTimeout(slugTimer)
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    slugStatus.value = 'idle'
    return
  }
  slugStatus.value = 'checking'
  slugTimer = setTimeout(async () => {
    try {
      const { data } = await $fetch<ApiSuccess<SlugAvailabilityDto>>('/api/onboarding/slug', { query: { slug } })
      if (data.slug === state.slug) {
        slugStatus.value = data.available ? 'available' : 'taken'
      }
    }
    catch {
      slugStatus.value = 'idle'
    }
  }, 350)
})

const creating = ref(false)
const errorMessage = ref<string | null>(null)
const slugError = ref<string | null>(null)

async function onSubmit(event: { data: CreateShopBody }) {
  creating.value = true
  errorMessage.value = null
  slugError.value = null
  try {
    await $fetch<ApiSuccess<ShopProfileDto>>('/api/onboarding/shop', { method: 'POST', body: event.data })
    clearNuxtData('me')
    await navigateTo({ path: '/dashboard/services', query: { welcome: '1' } })
  }
  catch (caught) {
    const code = (caught as { data?: { error?: { code?: string } } }).data?.error?.code
    if (code === 'SLUG_TAKEN') {
      slugError.value = 'That link name is taken. Try another.'
      slugStatus.value = 'taken'
    }
    else if (code === 'ALREADY_HAS_SHOP') {
      clearNuxtData('me')
      await navigateTo('/dashboard')
    }
    else {
      errorMessage.value = getApiErrorMessage(caught)
    }
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Set up your shop"
    description="This is what customers see. You can change your hours and services later."
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMessage"
      class="mb-5"
    />

    <UForm
      :schema="createShopBodySchema"
      :state="state"
      class="space-y-5"
      @submit="onSubmit"
    >
      <UFormField
        label="Shop name"
        name="name"
      >
        <UInput
          v-model="state.name"
          placeholder="e.g. Faisal Barber"
          size="xl"
          class="w-full"
          autofocus
        />
      </UFormField>

      <UFormField
        label="Customer link"
        name="slug"
        :error="slugError ?? undefined"
      >
        <UInput
          v-model="state.slug"
          size="xl"
          class="w-full"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          :ui="{ leading: 'ps-3', base: 'ps-[4.25rem]' }"
          @update:model-value="slugEdited = true"
        >
          <template #leading>
            <span class="text-sm text-muted">/shop/</span>
          </template>
          <template #trailing>
            <UIcon
              v-if="slugStatus === 'checking'"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-muted"
            />
            <UIcon
              v-else-if="slugStatus === 'available'"
              name="i-lucide-circle-check"
              class="size-4 text-success"
            />
            <UIcon
              v-else-if="slugStatus === 'taken'"
              name="i-lucide-circle-x"
              class="size-4 text-error"
            />
          </template>
        </UInput>
        <template #help>
          <span v-if="slugStatus === 'taken'">Taken. Try another.</span>
          <span
            v-else-if="state.slug"
            class="break-all"
          >{{ requestUrl.origin }}/shop/{{ state.slug }}</span>
          <span v-else>3–40 lowercase letters, numbers or dashes.</span>
        </template>
      </UFormField>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UFormField
          label="Timezone"
          name="timezone"
        >
          <USelectMenu
            v-model="state.timezone"
            :items="timeZones"
            virtualize
            size="xl"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Currency"
          name="currency"
        >
          <USelectMenu
            v-model="state.currency"
            :items="currencies"
            placeholder="Choose"
            size="xl"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField
        label="First barber"
        name="barberName"
        help="Usually you. You can add more barbers later."
      >
        <UInput
          v-model="state.barberName"
          autocomplete="name"
          size="xl"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        label="Create shop"
        trailing-icon="i-lucide-arrow-right"
        size="xl"
        block
        :loading="creating"
        :disabled="slugStatus === 'taken'"
      />
    </UForm>

    <template #footer>
      <span class="break-all">Signed in as {{ me?.user.email ?? formatIndianMobile(me?.user.phoneNumber ?? '') }}</span>
      ·
      <button
        type="button"
        class="font-medium text-highlighted underline-offset-2 hover:underline disabled:opacity-50"
        :disabled="signingOut"
        @click="signOut"
      >
        Sign out
      </button>
    </template>
  </AuthShell>
</template>
