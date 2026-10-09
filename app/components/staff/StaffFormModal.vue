<script setup lang="ts">
// Add a barber (name + mobile) or rename one (name only).
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { createStaffBodySchema } from '#shared/schemas/staff'
import type { StaffMemberDto } from '#shared/types/staff'

const props = defineProps<{
  /** Renaming this barber, or null to add one. */
  member: StaffMemberDto | null
  saving: boolean
}>()

const emit = defineEmits<{
  add: [input: z.output<typeof createStaffBodySchema>]
  rename: [name: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const renameSchema = createStaffBodySchema.pick({ name: true })
const schema = computed(() => (props.member ? renameSchema : createStaffBodySchema))
const state = reactive({ name: '', phone: '' })

watch(open, (isOpen) => {
  if (isOpen) {
    Object.assign(state, { name: props.member?.name ?? '', phone: '' })
  }
})

function onSubmit(event: FormSubmitEvent<{ name: string, phone?: string }>) {
  if (props.member) {
    emit('rename', event.data.name)
  }
  else {
    emit('add', event.data as z.output<typeof createStaffBodySchema>)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="member ? `Rename ${member.name}` : 'Add a barber'"
    :description="member ? 'Customers see this name in the queue.' : 'They\'ll appear in the queue straight away.'"
    :dismissible="!saving"
  >
    <template #body>
      <UForm
        id="staff-form"
        :schema="schema"
        :state="state"
        :disabled="saving"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="off"
            placeholder="e.g. Arjun"
            size="xl"
            class="w-full"
            autofocus
          />
        </UFormField>
        <UFormField
          v-if="!member"
          label="Mobile number"
          name="phone"
          help="They sign in to Trimly with this number. If they don't have an account yet, they get access the first time they do."
          required
        >
          <UInput
            v-model="state.phone"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            placeholder="98765 43210"
            size="xl"
            class="w-full"
            :ui="{ base: 'ps-12' }"
          >
            <template #leading>
              <span class="text-sm text-muted">+91</span>
            </template>
          </UInput>
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="staff-form"
          :label="member ? 'Save' : 'Add barber'"
          :loading="saving"
          :disabled="saving"
        />
      </div>
    </template>
  </UModal>
</template>
