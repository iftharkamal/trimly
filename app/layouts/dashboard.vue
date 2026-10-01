<script setup lang="ts">
const route = useRoute()
const signingOut = ref(false)

// Shop alerts on every dashboard page: online joins, bookings, cancellations.
const { permission, ready: alertsReady, enable, alert } = useBrowserNotifications()

function linkFor(type: string) {
  return type.startsWith('APPOINTMENT_') ? '/dashboard/appointments' : '/dashboard'
}

useNotificationFeed('/api/dashboard/notifications', (notification) => {
  alert({ title: notification.title, body: notification.body, url: linkFor(notification.type), tag: `shop-${notification.id}` })
  // Show the change straight away instead of waiting for the next refresh.
  refreshNuxtData()
})

const bell = computed(() => {
  switch (permission.value) {
    case 'granted':
      return { icon: 'i-lucide-bell-ring', label: 'Alerts are on' }
    case 'denied':
      return { icon: 'i-lucide-bell-off', label: 'Alerts are blocked in your browser settings' }
    case 'unsupported':
      return { icon: 'i-lucide-bell', label: 'Alerts show on this page while it is open' }
    default:
      return { icon: 'i-lucide-bell', label: 'Turn on alerts' }
  }
})

const links = [
  { label: 'Queue', to: '/dashboard', icon: 'i-lucide-list-ordered' },
  { label: 'Appointments', to: '/dashboard/appointments', icon: 'i-lucide-calendar' },
  { label: 'Services', to: '/dashboard/services', icon: 'i-lucide-tags' },
  { label: 'Reports', to: '/dashboard/reports', icon: 'i-lucide-chart-column' },
  { label: 'Settings', to: '/dashboard/settings', icon: 'i-lucide-settings' }
]

async function signOut() {
  signingOut.value = true
  await authClient.signOut()
  clearNuxtData()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-20 border-b border-default bg-default/85 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between gap-2">
        <div class="flex items-center gap-4 sm:gap-6">
          <NuxtLink
            to="/dashboard"
            class="flex items-center gap-2 font-semibold tracking-tight text-highlighted"
            aria-label="Trimly home"
          >
            <UIcon
              name="i-lucide-scissors"
              class="size-5 text-primary"
            />
            <span class="hidden sm:inline">Trimly</span>
          </NuxtLink>

          <nav
            class="flex items-center gap-1"
            aria-label="Dashboard"
          >
            <!-- Icons only on small screens; labels from the md breakpoint. -->
            <UButton
              v-for="link in links"
              :key="link.to"
              :to="link.to"
              :icon="link.icon"
              :aria-label="link.label"
              color="neutral"
              :variant="route.path === link.to ? 'soft' : 'ghost'"
              size="sm"
              :aria-current="route.path === link.to ? 'page' : undefined"
            >
              <span class="hidden md:inline">{{ link.label }}</span>
            </UButton>
          </nav>
        </div>

        <div class="flex items-center gap-1">
          <UButton
            v-if="alertsReady"
            :icon="bell.icon"
            :aria-label="bell.label"
            :title="bell.label"
            color="neutral"
            :variant="permission === 'default' ? 'soft' : 'ghost'"
            size="sm"
            @click="enable"
          />
          <UColorModeButton size="sm" />
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            :loading="signingOut"
            @click="signOut"
          >
            <span class="hidden sm:inline">Sign out</span>
          </UButton>
        </div>
      </UContainer>
    </header>

    <main>
      <slot />
    </main>
  </div>
</template>
