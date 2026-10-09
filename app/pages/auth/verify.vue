<script setup lang="ts">
// Email verification:
// - ?email=… right after sign-up: "check your inbox", with resend;
// - ?error=… when Better Auth rejected the link (expired, used): get a new one;
// - otherwise the link worked and Better Auth signed the person in.
const route = useRoute()
const { data: session } = await authClient.useSession(useFetch)

const sentTo = computed(() => (typeof route.query.email === 'string' ? route.query.email : null))
const state = computed(() => route.query.error ? 'failed' : sentTo.value ? 'pending' : session.value ? 'verified' : 'unknown')

const titles = {
  pending: { title: 'Check your email', description: undefined },
  failed: { title: 'This link didn\'t work', description: 'It may have expired (links work for 1 hour) or been used already.' },
  verified: { title: 'Email verified', description: 'Your account is ready.' },
  unknown: { title: 'Verify your email', description: 'Open the link we emailed you, or sign in to get a new one.' }
} as const
const heading = computed(() => titles[state.value])
useHead({ title: computed(() => `${heading.value.title} · Trimly`) })

// Resend (pending: to the address just used; failed: to one typed here).
const RESEND_SECONDS = 30
const emailInput = ref('')
const emailError = ref<string | null>(null)
const sending = ref(false)
const sent = ref(false)
const resendIn = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
onBeforeUnmount(() => clearInterval(timer))

async function resend(target: string | null) {
  const identifier = parseSignInIdentifier(target ?? '')
  if (identifier?.kind !== 'email') {
    emailError.value = 'Enter a valid email address.'
    return
  }
  emailError.value = null
  sending.value = true
  await authClient.sendVerificationEmail({ email: identifier.email, callbackURL: '/auth/verify' })
  sending.value = false
  sent.value = true
  resendIn.value = RESEND_SECONDS
  clearInterval(timer)
  timer = setInterval(() => {
    resendIn.value = Math.max(0, resendIn.value - 1)
    if (resendIn.value === 0) {
      clearInterval(timer)
    }
  }, 1000)
}
</script>

<template>
  <AuthShell
    :title="heading.title"
    :description="heading.description"
  >
    <!-- Right after sign-up -->
    <template v-if="state === 'pending'">
      <div
        class="rounded-2xl bg-elevated p-5 text-sm text-muted"
        role="status"
      >
        <p class="flex items-center gap-2 font-medium text-highlighted">
          <UIcon
            name="i-lucide-mail-check"
            class="size-5 text-success"
          />
          We sent a link to {{ sentTo }}
        </p>
        <p class="mt-2">
          Open it on this device to verify your email and sign in. It works for 1 hour.
          Can't find it? Check your spam folder.
        </p>
      </div>

      <div aria-live="polite">
        <p
          v-if="sent"
          class="mt-4 text-center text-sm text-success"
        >
          A new link is on its way.
        </p>
      </div>
      <UButton
        :label="resendIn > 0 ? `Send again in ${resendIn}s` : 'Send the link again'"
        icon="i-lucide-rotate-cw"
        color="neutral"
        variant="outline"
        size="lg"
        block
        class="mt-4"
        :loading="sending"
        :disabled="sending || resendIn > 0"
        @click="resend(sentTo)"
      />
    </template>

    <!-- The link was rejected -->
    <template v-else-if="state === 'failed'">
      <div
        v-if="sent"
        class="rounded-2xl bg-elevated p-5 text-sm text-muted"
        role="status"
      >
        If {{ emailInput }} has an account waiting for verification, a new link is on its way.
      </div>
      <form
        v-else
        class="space-y-4"
        novalidate
        @submit.prevent="resend(emailInput)"
      >
        <UFormField
          label="Email"
          name="email"
          :error="emailError ?? undefined"
        >
          <UInput
            v-model="emailInput"
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            size="xl"
            class="w-full"
            :disabled="sending"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Send a new link"
          size="xl"
          block
          :loading="sending"
          :disabled="sending"
        />
      </form>
    </template>

    <!-- The link worked -->
    <template v-else-if="state === 'verified'">
      <div
        class="mb-5 flex items-center gap-3 rounded-2xl bg-elevated p-5"
        role="status"
      >
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
          <UIcon
            name="i-lucide-check"
            class="size-5"
          />
        </span>
        <p class="text-sm text-muted">
          You're signed in as <span class="font-medium text-highlighted">{{ session?.user.email }}</span>.
        </p>
      </div>
      <UButton
        to="/dashboard"
        label="Continue"
        trailing-icon="i-lucide-arrow-right"
        size="xl"
        block
      />
    </template>

    <UButton
      v-else
      to="/auth/login"
      label="Go to sign in"
      size="xl"
      block
    />

    <template
      v-if="state !== 'verified'"
      #footer
    >
      <NuxtLink
        to="/auth/login"
        class="font-medium text-highlighted underline-offset-2 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </template>
  </AuthShell>
</template>
