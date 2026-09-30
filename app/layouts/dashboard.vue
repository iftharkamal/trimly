<script setup lang="ts">
const signingOut = ref(false)

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
      <UContainer class="flex h-14 items-center justify-between">
        <NuxtLink
          to="/dashboard"
          class="flex items-center gap-2 font-semibold tracking-tight text-highlighted"
        >
          <UIcon
            name="i-lucide-scissors"
            class="size-5 text-primary"
          />
          Trimly
        </NuxtLink>
        <div class="flex items-center gap-1">
          <UColorModeButton size="sm" />
          <UButton
            label="Sign out"
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="signingOut"
            @click="signOut"
          />
        </div>
      </UContainer>
    </header>

    <main>
      <slot />
    </main>
  </div>
</template>
