<script setup lang="ts">
// Shown to customers at the chair: they scan it and the join form opens.
const props = defineProps<{
  shopName: string
  slug: string
}>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const siteUrl = usePublicSiteUrl()
const link = computed(() => shopJoinUrl(siteUrl, props.slug))
const pageUrl = computed(() => shopPageUrl(siteUrl, props.slug))
const canShare = ref(false)
onMounted(() => {
  canShare.value = typeof navigator.share === 'function'
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast.add({ title: 'Link copied', color: 'success', icon: 'i-lucide-check' })
  }
  catch {
    toast.add({ title: 'Couldn\'t copy', description: link.value, color: 'neutral', icon: 'i-lucide-link' })
  }
}

async function share() {
  try {
    await navigator.share({ title: props.shopName, text: `Join the queue at ${props.shopName}`, url: link.value })
  }
  catch {
    // Closed the share sheet: nothing to do.
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="shopName"
    description="Customers scan this to join the queue."
  >
    <template #body>
      <div class="mx-auto max-w-xs space-y-4 text-center">
        <ShopQrCode :slug="slug" />
        <p class="text-lg font-semibold text-highlighted">
          Scan to join the queue
        </p>
        <p class="break-all text-sm text-muted">
          {{ pageUrl.replace(/^https?:\/\//, '') }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          :to="pageUrl"
          target="_blank"
          label="Preview customer page"
          icon="i-lucide-external-link"
          color="neutral"
          variant="link"
          size="sm"
          class="px-0"
        />
        <div class="flex gap-2">
          <UButton
            label="Copy link"
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            @click="copyLink"
          />
          <UButton
            v-if="canShare"
            label="Share"
            icon="i-lucide-share-2"
            @click="share"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
