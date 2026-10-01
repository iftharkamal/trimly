<script setup lang="ts">
// Shown for unknown pages and for failures the page can't recover from
// (e.g. the account couldn't be loaded).
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: notFound.value ? 'Page not found · Trimly' : 'Something went wrong · Trimly' })

const route = useRoute()

function tryAgain() {
  clearError({ redirect: route.fullPath })
}
</script>

<template>
  <UApp>
    <AuthShell
      v-if="notFound"
      title="Page not found"
      description="The link may be wrong, or the page may have moved."
    >
      <UButton
        label="Go to the home page"
        size="xl"
        block
        @click="clearError({ redirect: '/' })"
      />
    </AuthShell>

    <AuthShell
      v-else
      :title="error.statusMessage || 'Something went wrong'"
      description="This is usually brief. Check your connection and try again."
    >
      <div class="space-y-3">
        <UButton
          label="Try again"
          icon="i-lucide-rotate-ccw"
          size="xl"
          block
          @click="tryAgain"
        />
        <UButton
          label="Go to the home page"
          color="neutral"
          variant="ghost"
          size="xl"
          block
          @click="clearError({ redirect: '/' })"
        />
      </div>
    </AuthShell>
  </UApp>
</template>
