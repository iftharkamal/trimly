<template>
  <!-- Toasts at the top, clear of the dashboard's bottom tab bar on phones. -->
  <UApp :toaster="{ position: 'top-center' }">
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
