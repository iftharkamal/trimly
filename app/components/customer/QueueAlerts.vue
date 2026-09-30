<script setup lang="ts">
import type { AlertPermission } from '~/composables/useBrowserNotifications'

defineProps<{
  permission: AlertPermission
  /** In-page sound/vibration unlocked (for browsers without notifications). */
  soundOn: boolean
}>()

const emit = defineEmits<{
  enable: []
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <div class="flex items-start gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-elevated">
        <UIcon
          :name="permission === 'granted' || soundOn ? 'i-lucide-bell-ring' : permission === 'denied' ? 'i-lucide-bell-off' : 'i-lucide-bell'"
          class="size-4 text-highlighted"
        />
      </span>
      <div class="min-w-0 flex-1">
        <template v-if="permission === 'granted'">
          <p class="font-medium text-highlighted">
            Alerts are on
          </p>
          <p class="text-sm text-muted">
            We'll notify you when your turn is getting close, while this page is open.
          </p>
        </template>
        <template v-else-if="permission === 'denied'">
          <p class="font-medium text-highlighted">
            Alerts are blocked
          </p>
          <p class="text-sm text-muted">
            Allow notifications for this site in your browser settings, or keep this page open. It updates by itself.
          </p>
        </template>
        <template v-else-if="permission === 'unsupported'">
          <p class="font-medium text-highlighted">
            {{ soundOn ? 'Sound alerts are on' : 'Keep this page open' }}
          </p>
          <p class="text-sm text-muted">
            This browser can't show notifications. We'll beep and show a banner here when your turn is getting close.
          </p>
        </template>
        <template v-else>
          <p class="font-medium text-highlighted">
            Get an alert when it's nearly your turn
          </p>
          <p class="text-sm text-muted">
            We'll notify you when your wait is about 15 minutes, while this page is open.
          </p>
        </template>
      </div>
    </div>

    <UButton
      v-if="permission === 'default' || (permission === 'unsupported' && !soundOn)"
      :label="permission === 'default' ? 'Turn on alerts' : 'Turn on sound alerts'"
      icon="i-lucide-bell"
      color="neutral"
      variant="outline"
      block
      class="mt-3"
      @click="emit('enable')"
    />
  </UCard>
</template>
