<script setup lang="ts">
import { openingHoursSchema, type OpeningHours } from '#shared/schemas/hours'

definePageMeta({ layout: 'dashboard', middleware: 'auth', shop: 'required' })
useHead({ title: 'Settings · Trimly' })

const { hours, error, refresh, saving, save } = await useOpeningHours()
const { me, refresh: refreshMe } = useCurrentUser()
const toast = useToast()

// The gap between customers in waiting-time estimates (owner only; checked on the server too).
const BUFFER_OPTIONS = [0, 2, 5, 10, 15, 20, 30]
const buffer = ref(me.value?.shop?.serviceBufferMinutes ?? 5)
watch(() => me.value?.shop?.serviceBufferMinutes, (value) => {
  if (value !== undefined) {
    buffer.value = value
  }
})
const bufferChoices = computed(() => [...new Set([...BUFFER_OPTIONS, buffer.value])]
  .sort((a, b) => a - b)
  .map(minutes => ({ label: minutes === 0 ? 'No gap' : `${minutes} minutes`, value: minutes })))
const savingBuffer = ref(false)

// Open or closed to online customers (staff can also change it from the queue screen).
const savingStatus = ref(false)

async function setShopOpen(isOpen: boolean) {
  savingStatus.value = true
  try {
    await $fetch('/api/dashboard/shop', { method: 'PATCH', body: { isOpen } })
    await refreshMe()
    toast.add(isOpen
      ? { title: 'Shop is open', description: 'Customers can join online.', color: 'success', icon: 'i-lucide-door-open' }
      : { title: 'Shop is closed', description: 'Online joining is paused. You can still add walk-ins.', color: 'neutral', icon: 'i-lucide-door-closed' })
  }
  catch (caught) {
    toast.add({ title: 'Could not update', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    savingStatus.value = false
  }
}

async function saveBuffer() {
  savingBuffer.value = true
  try {
    await $fetch('/api/dashboard/shop', { method: 'PATCH', body: { serviceBufferMinutes: buffer.value } })
    await refreshMe()
    toast.add({
      title: 'Saved',
      description: buffer.value === 0 ? 'Waiting times now assume no gap between customers.' : `Waiting times now include a ${buffer.value}-minute gap between customers.`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
  catch (caught) {
    toast.add({ title: 'Could not save', description: getApiErrorMessage(caught), color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    savingBuffer.value = false
  }
}
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
      <NuxtLink
        to="/dashboard/settings/staff"
        class="group flex items-center gap-4 rounded-lg bg-default p-4 ring-1 ring-default transition-colors hover:bg-elevated sm:p-5"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-elevated text-highlighted group-hover:bg-accented">
          <UIcon
            name="i-lucide-users"
            class="size-5"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-highlighted">Staff</span>
          <span class="block text-sm text-muted">Add barbers, see who's working, deactivate.</span>
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-5 text-dimmed"
        />
      </NuxtLink>

      <NuxtLink
        to="/dashboard/settings/qr-poster"
        class="group flex items-center gap-4 rounded-lg bg-default p-4 ring-1 ring-default transition-colors hover:bg-elevated sm:p-5"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-elevated text-highlighted group-hover:bg-accented">
          <UIcon
            name="i-lucide-qr-code"
            class="size-5"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-highlighted">QR poster</span>
          <span class="block text-sm text-muted">Print it for the counter, or share the QR code online.</span>
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-5 text-dimmed"
        />
      </NuxtLink>

      <UCard v-if="me?.shop">
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Shop status
          </h2>
          <p class="mt-1 text-sm text-muted">
            Whether customers can join your queue online. Your staff can change this from the queue screen too.
          </p>
        </template>
        <ShopStatusChooser
          :is-open="me.shop.isOpen"
          :saving="savingStatus"
          @change="setShopOpen"
        />
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Queue
          </h2>
          <p class="mt-1 text-sm text-muted">
            How customers' waiting times are estimated.
          </p>
        </template>

        <UFormField
          label="Time between customers"
          help="Added after each service in every waiting-time estimate: cleaning up, taking payment."
        >
          <div class="flex flex-wrap items-center gap-3">
            <USelect
              v-model="buffer"
              :items="bufferChoices"
              class="w-44"
              :disabled="savingBuffer"
            />
            <UButton
              label="Save"
              :loading="savingBuffer"
              :disabled="savingBuffer || buffer === me?.shop?.serviceBufferMinutes"
              @click="saveBuffer"
            />
          </div>
        </UFormField>
      </UCard>

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
