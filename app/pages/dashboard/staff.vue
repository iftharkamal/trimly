<script setup lang="ts">
import type { z } from 'zod'
import type { createStaffBodySchema } from '#shared/schemas/staff'
import type { StaffMemberDto } from '#shared/types/staff'

definePageMeta({ layout: 'dashboard', middleware: 'auth', shop: 'required', role: 'OWNER' })
useHead({ title: 'Staff · Trimly' })

const { staff, error, refresh, saving, updating, add, update } = await useStaff()

const STATUS: Record<StaffMemberDto['status'], { label: string, color: 'success' | 'neutral' | 'warning' }> = {
  SERVING: { label: 'With a customer', color: 'warning' },
  AVAILABLE: { label: 'Free', color: 'success' },
  INACTIVE: { label: 'Inactive', color: 'neutral' }
}

function accountLine(member: StaffMemberDto): string {
  if (member.account.status === 'INVITED') {
    return `Invited · gets access when they sign in with ${formatIndianMobile(member.invitePhone ?? '')}`
  }
  const contact = member.account.phoneNumber ? formatIndianMobile(member.account.phoneNumber) : member.account.email
  return `Signs in as ${contact ?? member.account.name ?? 'their account'}`
}

// Add / rename
const formOpen = ref(false)
const editing = ref<StaffMemberDto | null>(null)

function openForm(member: StaffMemberDto | null) {
  editing.value = member
  formOpen.value = true
}

async function onAdd(input: z.output<typeof createStaffBodySchema>) {
  if (await add(input)) {
    formOpen.value = false
  }
}

async function onRename(name: string) {
  if (editing.value && await update(editing.value, { name })) {
    formOpen.value = false
  }
}

// Deactivate asks first
const deactivating = ref<StaffMemberDto | null>(null)
const confirmOpen = computed({
  get: () => deactivating.value !== null,
  set: (open) => {
    if (!open) {
      deactivating.value = null
    }
  }
})

async function onConfirmDeactivate() {
  if (deactivating.value) {
    await update(deactivating.value, { isActive: false })
    deactivating.value = null
  }
}

function actions(member: StaffMemberDto) {
  return [[
    { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => openForm(member) },
    member.isActive
      ? { label: 'Deactivate', icon: 'i-lucide-user-x', color: 'error' as const, onSelect: () => (deactivating.value = member) }
      : { label: 'Reactivate', icon: 'i-lucide-user-check', onSelect: () => update(member, { isActive: true }) }
  ]]
}
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-6 sm:py-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          Staff
        </h1>
        <p class="mt-1 text-sm text-muted">
          Barbers who take customers in your queue.
        </p>
      </div>
      <UButton
        label="Add barber"
        icon="i-lucide-user-plus"
        size="lg"
        @click="openForm(null)"
      />
    </header>

    <UAlert
      v-if="error && !staff"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load your staff"
      :description="getApiErrorMessage(error)"
      :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UCard
      v-else-if="staff"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul class="divide-y divide-default">
        <li
          v-for="member in staff"
          :key="member.id"
          class="flex items-center gap-4 px-4 py-4 sm:px-5"
          :class="{ 'opacity-60': !member.isActive }"
        >
          <UAvatar
            :alt="member.name"
            size="md"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate font-medium text-highlighted">
                {{ member.name }}
              </p>
              <UBadge
                v-if="member.role === 'OWNER'"
                label="Owner"
                color="neutral"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-else-if="member.account.status === 'INVITED'"
                label="Invited"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </div>
            <p class="truncate text-sm text-muted">
              {{ accountLine(member) }}
            </p>
          </div>
          <div class="hidden text-right sm:block">
            <UBadge
              :label="STATUS[member.status].label"
              :color="STATUS[member.status].color"
              variant="subtle"
            />
            <p
              v-if="member.isActive && member.waiting"
              class="mt-1 text-xs text-muted"
            >
              {{ member.waiting }} waiting
            </p>
          </div>
          <UDropdownMenu
            :items="actions(member)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :loading="updating === member.id"
              :aria-label="`Actions for ${member.name}`"
            />
          </UDropdownMenu>
        </li>
      </ul>
    </UCard>

    <StaffFormModal
      v-model:open="formOpen"
      :member="editing"
      :saving="saving || updating !== null"
      @add="onAdd"
      @rename="onRename"
    />

    <ConfirmModal
      v-model:open="confirmOpen"
      :title="`Deactivate ${deactivating?.name ?? 'barber'}?`"
      description="They won't get new customers, and a barber's dashboard access is removed. You can reactivate them later."
      confirm-label="Deactivate"
      :loading="updating !== null"
      @confirm="onConfirmDeactivate"
    />
  </UContainer>
</template>
