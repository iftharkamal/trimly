<script setup lang="ts">
import { openingHoursSchema, type OpeningHours } from '#shared/schemas/hours'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'shop'] })
useHead({ title: 'Settings · Trimly' })

const { hours, error, refresh, saving, save } = await useOpeningHours()
const { data: me, refresh: refreshMe } = await useMe()
const toast = useToast()
// Only the owner edits the opening hours (the server enforces it too).
const isOwner = computed(() => me.value?.role === 'OWNER')

// Add or change the number used for signing in with a code.
const phoneModalOpen = ref(false)

async function onPhoneVerified() {
  phoneModalOpen.value = false
  await refreshMe()
  toast.add({ title: 'Mobile number verified', description: 'You can now sign in with a code texted to it.', color: 'success', icon: 'i-lucide-check' })
}

// Sign out of every other phone or computer (e.g. a lost phone); stay signed in here.
const confirmSignOutOthers = ref(false)
const signingOutOthers = ref(false)

async function signOutOthers() {
  signingOutOthers.value = true
  const { error: failed } = await authClient.revokeOtherSessions()
  signingOutOthers.value = false
  confirmSignOutOthers.value = false
  toast.add(failed
    ? { title: 'Could not sign out other devices', description: failed.message, color: 'error', icon: 'i-lucide-circle-alert' }
    : { title: 'Signed out of other devices', description: 'This device stays signed in.', color: 'success', icon: 'i-lucide-check' })
}

function copy(value: OpeningHours | null | undefined): OpeningHours['days'] {
  return value ? value.days.map(day => ({ weekday: day.weekday, ranges: day.ranges.map(range => ({ ...range })) })) : []
}

// Edit a copy; save sends the whole week.
const draft = ref(copy(hours.value))
watch(hours, value => (draft.value = copy(value)))

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(hours.value?.days ?? []))
const problem = computed(() => {
  const result = openingHoursSchema.safeParse({ days: draft.value })
  return result.success ? null : result.error.issues[0]?.message ?? 'Check the times'
})

async function onSave() {
  if (!problem.value) {
    await save({ days: draft.value })
  }
}
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-6 sm:py-8">
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
      Settings
    </h1>

    <template v-if="isOwner">
      <UAlert
        v-if="error && !hours"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Couldn't load opening hours"
        :description="getApiErrorMessage(error)"
        :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refresh() }]"
      />

      <UCard
        v-else
        :ui="{ body: 'px-4 py-2 sm:px-6' }"
      >
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Opening hours
          </h2>
          <p class="mt-1 text-sm text-muted">
            Online bookings are only offered inside these hours (shop time). The Open/Closed switch on the queue
            still controls online queue joining.
          </p>
        </template>

        <OpeningHoursEditor v-model="draft" />

        <template #footer>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p
              class="text-sm"
              :class="problem ? 'text-error' : 'text-muted'"
            >
              {{ problem ?? (isDirty ? 'Unsaved changes' : 'All changes saved') }}
            </p>
            <div class="flex gap-2">
              <UButton
                v-if="isDirty"
                label="Discard"
                color="neutral"
                variant="ghost"
                :disabled="saving"
                @click="draft = copy(hours)"
              />
              <UButton
                label="Save hours"
                :loading="saving"
                :disabled="!isDirty || !!problem"
                @click="onSave"
              />
            </div>
          </div>
        </template>
      </UCard>
    </template>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-highlighted">
          Account
        </h2>
      </template>

      <dl class="space-y-4 text-sm">
        <div>
          <dt class="text-muted">
            Email
          </dt>
          <dd class="break-all font-medium text-highlighted">
            {{ me?.user.email ?? 'Not added' }}
          </dd>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <dt class="text-muted">
              Mobile number
            </dt>
            <dd class="font-medium text-highlighted">
              {{ me?.user.phoneNumber ? formatIndianMobile(me.user.phoneNumber) : 'Not added' }}
            </dd>
            <p class="mt-0.5 text-xs text-muted">
              Sign in with a code texted to it.
            </p>
          </div>
          <UButton
            :label="me?.user.phoneNumber ? 'Change' : 'Add number'"
            icon="i-lucide-smartphone"
            color="neutral"
            variant="outline"
            @click="phoneModalOpen = true"
          />
        </div>
      </dl>

      <USeparator class="my-5" />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="max-w-md text-sm text-muted">
          Lost a phone, or signed in on a shared computer? Sign out everywhere else. You stay signed in here.
        </p>
        <UButton
          label="Sign out of other devices"
          icon="i-lucide-log-out"
          color="neutral"
          variant="outline"
          @click="confirmSignOutOthers = true"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="phoneModalOpen"
      :title="me?.user.phoneNumber ? 'Change mobile number' : 'Add a mobile number'"
      description="We'll text a code to check it's yours."
    >
      <template #body>
        <AddPhoneForm
          v-if="phoneModalOpen"
          @done="onPhoneVerified"
        />
      </template>
    </UModal>

    <ConfirmModal
      v-model:open="confirmSignOutOthers"
      title="Sign out of other devices?"
      description="Every other phone and computer using this account will need to sign in again."
      confirm-label="Sign out others"
      :loading="signingOutOthers"
      @confirm="signOutOthers"
    />
  </UContainer>
</template>
