<script setup lang="ts">
// The shop's QR code: scanning it opens the customer page with the join form.
// Always dark on white, whatever the theme, so every phone camera reads it.
import { renderSVG } from 'uqr'

const props = defineProps<{
  slug: string
}>()

const siteUrl = usePublicSiteUrl()
const link = computed(() => shopJoinUrl(siteUrl, props.slug))
// Generated here from our own link, so it's safe to insert as markup.
const svg = computed(() => renderSVG(link.value, { ecc: 'M', border: 2, blackColor: '#09090b', whiteColor: '#ffffff' }))
</script>

<template>
  <div
    class="aspect-square w-full overflow-hidden rounded-2xl bg-white p-2 [&>svg]:size-full"
    role="img"
    :aria-label="`QR code that opens ${link}`"
    v-html="svg"
  />
</template>
