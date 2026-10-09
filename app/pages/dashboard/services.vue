<script setup lang="ts">
import type { CreateServiceBody } from '#shared/schemas/service'
import type { ManagedServiceDto } from '#shared/types/dashboard'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'shop', 'owner'] })
useHead({ title: 'Services · Trimly' })

const route = useRoute()
const { data: me } = await useMe()
const currency = computed(() => me.value?.shop?.currency ?? 'INR')

const { services, error, refresh, saving, toggling, save, setActive } = await useManagedServices()

const active = computed(() => (services.value ?? []).filter(service => service.isActive))
const archived = computed(() => (services.value ?? []).filter(service => !service.isActive))
const isWelcome = computed(() => route.query.welcome === '1' || (services.value !== null && active.value.length === 0))

const formOpen = ref(false)
const editing = ref<ManagedServiceDto | null>(null)

function openForm(service: ManagedServiceDto | null) {
  editing.value = service
  formOpen.value = true
}

async function onSave(input: CreateServiceBody) {
  if (await save(input, editing.value?.id)) {
    formOpen.value = false
  }
}
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-6 sm:py-8">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
        Services
      </h1>
      <UButton
        label="Add service"
        icon="i-lucide-plus"
        size="lg"
        @click="openForm(null)"
      />
    </header>

    <UAlert
      v-if="isWelcome"
      color="neutral"
      variant="subtle"
      icon="i-lucide-sparkles"
      title="Add the services you offer"
      description="Customers choose from these when they join the queue or book. Add at least one to start taking customers."
    />

    <UAlert
      v-if="error && !services"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Couldn't load services"
      :description="getApiErrorMessage(error)"
      :actions="[{ label: 'Try again', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UCard
      v-else-if="services"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <ul
        v-if="active.length"
        class="divide-y divide-default"
      >
        <li
          v-for="service in active"
          :key="service.id"
          class="flex items-center gap-4 px-4 py-4 sm:px-5"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-highlighted">
              {{ service.name }}
            </p>
            <p class="text-sm text-muted">
              {{ formatMinutes(service.durationMinutes) }} · {{ formatMoney(service.priceMinor, currency) }}
            </p>
          </div>
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            :aria-label="`Edit ${service.name}`"
            @click="openForm(service)"
          />
          <UButton
            icon="i-lucide-archive"
            color="neutral"
            variant="ghost"
            :aria-label="`Archive ${service.name}`"
            :loading="toggling === service.id"
            @click="setActive(service, false)"
          />
        </li>
      </ul>
      <div
        v-else
        class="flex flex-col items-center px-6 py-12 text-center"
      >
        <UIcon
          name="i-lucide-tags"
          class="size-8 text-dimmed"
        />
        <p class="mt-3 font-medium text-highlighted">
          No services yet
        </p>
        <UButton
          label="Add your first service"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          class="mt-4"
          @click="openForm(null)"
        />
      </div>
    </UCard>

    <section
      v-if="archived.length"
      class="space-y-2"
    >
      <h2 class="text-xs font-semibold uppercase tracking-widest text-muted">
        Archived
      </h2>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li
            v-for="service in archived"
            :key="service.id"
            class="flex items-center gap-4 px-4 py-3 opacity-70 sm:px-5"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ service.name }}
              </p>
              <p class="text-sm text-muted">
                {{ formatMinutes(service.durationMinutes) }} · {{ formatMoney(service.priceMinor, currency) }}
              </p>
            </div>
            <UButton
              label="Restore"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="toggling === service.id"
              @click="setActive(service, true)"
            />
          </li>
        </ul>
      </UCard>
    </section>

    <ServiceFormModal
      v-model:open="formOpen"
      :service="editing"
      :currency="currency"
      :saving="saving"
      @save="onSave"
    />
  </UContainer>
</template>
