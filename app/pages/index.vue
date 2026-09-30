<template>
  <UContainer class="relative py-16">
    <UColorModeButton
      size="sm"
      class="absolute top-3 right-3"
    />
    <h1 class="text-3xl font-bold tracking-tight text-highlighted">
      Trimly
    </h1>
    <p class="mt-2 text-muted">
      Barber shop queue management.
    </p>
    <UButton
      to="/dashboard"
      label="Barber dashboard"
      trailing-icon="i-lucide-arrow-right"
      class="mt-6"
    />
  </UContainer>
</template>
