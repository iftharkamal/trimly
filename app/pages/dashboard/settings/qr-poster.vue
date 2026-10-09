<script setup lang="ts">
// A poster for the counter, mirror or door: customers scan it and join the
// queue without asking anyone. Prints on its own (no menus or buttons), and
// the QR code can be downloaded or shared as an image.
definePageMeta({ layout: 'dashboard', middleware: 'auth', shop: 'required', role: 'OWNER' })
useHead({ title: 'QR poster · Trimly' })

const { shop } = useCurrentUser()
const toast = useToast()
const siteUrl = usePublicSiteUrl()

const link = computed(() => (shop.value ? shopJoinUrl(siteUrl, shop.value.slug) : ''))
const shortLink = computed(() => (shop.value ? shopPageUrl(siteUrl, shop.value.slug).replace(/^https?:\/\//, '') : ''))
const fileName = computed(() => `${shop.value?.slug ?? 'shop'}-qr.png`)

const canShareFiles = ref(false)
onMounted(() => {
  try {
    canShareFiles.value = typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([''], 'qr.png', { type: 'image/png' })] })
  }
  catch {
    canShareFiles.value = false
  }
})

function print() {
  window.print()
}

const working = ref<'download' | 'share' | null>(null)

async function download() {
  working.value = 'download'
  try {
    const url = URL.createObjectURL(await shopQrPng(link.value))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName.value
    anchor.click()
    URL.revokeObjectURL(url)
  }
  catch {
    toast.add({ title: 'Couldn\'t make the image', description: 'Try printing the poster instead.', color: 'error', icon: 'i-lucide-circle-alert' })
  }
  finally {
    working.value = null
  }
}

async function share() {
  working.value = 'share'
  try {
    const file = new File([await shopQrPng(link.value)], fileName.value, { type: 'image/png' })
    await navigator.share({ files: [file], title: shop.value?.name, text: `Scan to join the queue at ${shop.value?.name}: ${link.value}` })
  }
  catch {
    // Closed the share sheet, or sharing failed: nothing to undo.
  }
  finally {
    working.value = null
  }
}
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-6 sm:py-8 print:max-w-none print:p-0">
    <div class="space-y-4 print:hidden">
      <UButton
        to="/dashboard/settings"
        label="Settings"
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="link"
        class="-ms-2 px-2"
      />
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
            QR poster
          </h1>
          <p class="mt-1 text-sm text-muted">
            Put it where customers wait. Scanning it opens your queue with the join form ready.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Print"
            icon="i-lucide-printer"
            @click="print"
          />
          <UButton
            label="Download QR"
            icon="i-lucide-download"
            color="neutral"
            variant="outline"
            :loading="working === 'download'"
            :disabled="working !== null"
            @click="download"
          />
          <UButton
            v-if="canShareFiles"
            label="Share"
            icon="i-lucide-share-2"
            color="neutral"
            variant="outline"
            :loading="working === 'share'"
            :disabled="working !== null"
            @click="share"
          />
        </div>
      </div>
    </div>

    <!-- The poster: always light, like paper, and the only thing that prints. -->
    <article
      v-if="shop"
      class="mx-auto flex max-w-md flex-col items-center gap-6 rounded-3xl bg-white px-8 py-10 text-center text-neutral-900 shadow-lg ring-1 ring-neutral-200 print:max-w-none print:rounded-none print:shadow-none print:ring-0"
      aria-label="Poster"
    >
      <div class="flex items-center gap-2 text-sm font-medium text-neutral-500">
        <UIcon
          name="i-lucide-scissors"
          class="size-4"
        />
        Live queue
      </div>
      <h2 class="text-4xl font-bold leading-tight tracking-tight">
        {{ shop.name }}
      </h2>
      <p class="text-2xl font-semibold">
        Scan to join the queue
      </p>
      <div class="w-full max-w-72">
        <ShopQrCode :slug="shop.slug" />
      </div>
      <ol class="grid w-full gap-2 text-left text-base">
        <li class="flex items-center gap-3">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-900 text-sm font-semibold text-white">1</span>
          Scan with your phone camera
        </li>
        <li class="flex items-center gap-3">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-900 text-sm font-semibold text-white">2</span>
          Pick your service, add your name and number
        </li>
        <li class="flex items-center gap-3">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-900 text-sm font-semibold text-white">3</span>
          Watch your place and waiting time live
        </li>
      </ol>
      <p class="break-all text-sm text-neutral-500">
        {{ shortLink }}
      </p>
    </article>
  </UContainer>
</template>
