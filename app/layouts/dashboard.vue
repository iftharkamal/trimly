<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const route = useRoute()
// Who is signed in, as the server reported it (loaded by the auth middleware).
const { user, role, contact, signingOut, signOut } = useCurrentUser()

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

// Barbers don't get the owner-only pages (the server refuses them anyway).
const allLinks = [
  { label: 'Queue', to: '/dashboard', icon: 'i-lucide-list-ordered', ownerOnly: false },
  { label: 'Appointments', to: '/dashboard/appointments', icon: 'i-lucide-calendar', ownerOnly: false },
  { label: 'Services', to: '/dashboard/services', icon: 'i-lucide-tags', ownerOnly: true },
  { label: 'Reports', to: '/dashboard/reports', icon: 'i-lucide-chart-column', ownerOnly: true }
  // Settings (and Staff under it, /dashboard/settings/staff) is in the account menu.
]
const links = computed(() => allLinks.filter(link => !link.ownerOnly || role.value === 'OWNER'))

// A section stays highlighted on its sub-pages (Settings → Staff); the queue only on itself.
function isActive(to: string) {
  return route.path === to || (to !== '/dashboard' && route.path.startsWith(`${to}/`))
}

const accountMenu = computed<DropdownMenuItem[][]>(() => [
  [
    { type: 'label', label: user.value?.name ?? '' },
    { type: 'label', label: contact.value, class: 'pt-0 font-normal text-muted' }
  ],
  [{ label: 'Settings', icon: 'i-lucide-settings', to: '/dashboard/settings' }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => signOut() }]
])
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-20 border-b border-default bg-default/85 backdrop-blur print:hidden">
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

          <!-- Wide screens: sections in the top bar. Phones and tablets use the bottom bar. -->
          <nav
            class="hidden items-center gap-1 lg:flex"
            aria-label="Dashboard"
          >
            <UButton
              v-for="link in links"
              :key="link.to"
              :to="link.to"
              :icon="link.icon"
              :label="link.label"
              color="neutral"
              :variant="isActive(link.to) ? 'soft' : 'ghost'"
              size="sm"
              :aria-current="isActive(link.to) ? 'page' : undefined"
            />
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
          <UDropdownMenu
            :items="accountMenu"
            :content="{ align: 'end' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              class="gap-2"
              :loading="signingOut"
              :aria-label="`Account: ${user?.name ?? ''}. Open menu to sign out`"
            >
              <UAvatar
                :alt="user?.name"
                size="xs"
              />
              <span class="hidden max-w-40 text-left lg:block">
                <span class="block truncate text-sm font-medium text-highlighted">{{ user?.name }}</span>
                <span class="block truncate text-xs text-muted">{{ contact }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-down"
                class="hidden size-4 text-dimmed lg:block"
              />
            </UButton>
          </UDropdownMenu>
        </div>
      </UContainer>
    </header>

    <!-- Room for the bottom bar (and the phone's home indicator) below the content. -->
    <main class="pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 print:pb-0">
      <slot />
    </main>

    <!-- Phones and tablets: sections as a bottom tab bar, in thumb reach. -->
    <nav
      class="fixed inset-x-0 bottom-0 z-20 border-t border-default bg-default/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      aria-label="Dashboard"
    >
      <ul
        class="mx-auto grid max-w-xl"
        :style="{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }"
      >
        <li
          v-for="link in links"
          :key="link.to"
        >
          <NuxtLink
            :to="link.to"
            class="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors"
            :class="isActive(link.to) ? 'text-highlighted' : 'text-muted hover:text-highlighted'"
            :aria-current="isActive(link.to) ? 'page' : undefined"
          >
            <span
              class="grid h-7 w-12 place-items-center rounded-full transition-colors"
              :class="isActive(link.to) ? 'bg-accented' : ''"
            >
              <UIcon
                :name="link.icon"
                class="size-5"
              />
            </span>
            <span class="max-w-full truncate px-1">{{ link.label }}</span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
