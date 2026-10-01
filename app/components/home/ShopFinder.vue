<script setup lang="ts">
// Open a shop from a pasted link ("…/shop/faisal-barber") or its name
// ("faisal-barber", "Faisal Barber"). Checks the shop exists first.
const value = ref('')
const searching = ref(false)
const errorMessage = ref<string | null>(null)

function toSlug(input: string): string {
  const text = input.trim()
  const fromLink = text.match(/\/shop\/([^/?#\s]+)/)
  const raw = fromLink ? fromLink[1]! : text
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function open() {
  errorMessage.value = null
  const slug = toSlug(value.value)
  if (!slug) {
    errorMessage.value = 'Enter the shop\'s link or name.'
    return
  }

  searching.value = true
  try {
    await $fetch(`/api/shops/by-slug/${slug}`)
    await navigateTo(`/shop/${slug}`)
  }
  catch {
    errorMessage.value = 'We couldn\'t find that shop. Check the link on their poster or message.'
  }
  finally {
    searching.value = false
  }
}
</script>

<template>
  <form
    class="space-y-2"
    @submit.prevent="open"
  >
    <label
      for="shop-finder"
      class="block text-sm font-medium text-highlighted"
    >
      Find your barber
    </label>
    <div class="flex gap-2">
      <UInput
        id="shop-finder"
        v-model="value"
        placeholder="Shop link or name"
        icon="i-lucide-store"
        size="xl"
        autocomplete="off"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="go"
        class="min-w-0 flex-1"
        :color="errorMessage ? 'error' : undefined"
        :highlight="!!errorMessage"
        aria-describedby="shop-finder-help"
      />
      <UButton
        type="submit"
        icon="i-lucide-arrow-right"
        size="xl"
        square
        :loading="searching"
        aria-label="Open shop"
        class="shrink-0"
      />
    </div>
    <p
      id="shop-finder-help"
      class="text-xs"
      :class="errorMessage ? 'text-error' : 'text-dimmed'"
      aria-live="polite"
    >
      {{ errorMessage ?? 'Or scan the QR code at the shop.' }}
    </p>
  </form>
</template>
