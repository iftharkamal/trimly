<template>
  <div class="min-h-dvh">
    <div class="mx-auto flex w-full max-w-md justify-end px-4 pt-3">
      <UColorModeButton size="sm" />
    </div>
    <!-- Room at the bottom for the fixed Join button on the shop page -->
    <main class="mx-auto w-full max-w-md px-4 pt-2 pb-32 sm:pt-4">
      <slot />
    </main>
  </div>
</template>
