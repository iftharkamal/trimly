<script setup lang="ts">
import { openingHoursSchema, type OpeningHours } from '#shared/schemas/hours'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'shop'] })
useHead({ title: 'Settings · Trimly' })

const { hours, error, refresh, saving, save } = await useOpeningHours()

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
  </UContainer>
</template>
