<script setup lang="ts">
const route = useRoute()
const signingOut = ref(false)

const links = [
  { label: 'Queue', to: '/dashboard', icon: 'i-lucide-list-ordered' },
  { label: 'Appointments', to: '/dashboard/appointments', icon: 'i-lucide-calendar' },
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
