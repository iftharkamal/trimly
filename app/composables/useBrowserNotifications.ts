// The browser notification channel, on the page side: permission, a system
// notification when the tab is in the background (through the service worker,
// which Android requires), plus an in-page toast, vibration and a short beep.
// Works only while the page is open; background push is a later channel.

export type AlertPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export interface PageAlert {
  title: string
  body: string
  /** Where tapping the system notification should go. */
  url: string
  /** Replaces an earlier notification with the same tag. */
  tag: string
}

// Shared across the page, so the beep can reuse one audio context.
let audio: AudioContext | null = null

function beep() {
  try {
    audio ??= new AudioContext()
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.15, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + 0.4)
  }
  catch {
    // Sound is a bonus; some browsers block it until the user interacts.
  }
}

export function useBrowserNotifications() {
  const toast = useToast()
  const permission = ref<AlertPermission>('unsupported')
  /** False until the browser's real support is known (not during the server render). */
  const ready = ref(false)

  onMounted(() => {
    permission.value = 'Notification' in window && 'serviceWorker' in navigator
      ? Notification.permission
      : 'unsupported'
    ready.value = true
  })

  async function registration(): Promise<ServiceWorkerRegistration | null> {
    try {
      await navigator.serviceWorker.register('/sw.js')
      return await navigator.serviceWorker.ready
    }
    catch {
      return null
    }
  }

  /** Asks for permission. Must run from a tap/click. */
  async function enable(): Promise<boolean> {
    // Unlock audio during the user's tap, so later beeps are allowed.
    try {
      audio ??= new AudioContext()
      await audio.resume()
    }
    catch {
      // No sound; alerts still work.
    }
    if (permission.value === 'unsupported') {
      return false
    }
    permission.value = await Notification.requestPermission()
    if (permission.value === 'granted') {
      await registration()
      return true
    }
    return false
  }

  async function alert(item: PageAlert) {
    toast.add({ title: item.title, description: item.body, icon: 'i-lucide-bell', color: 'neutral', duration: 8000 })
    navigator.vibrate?.([200, 100, 200])
    beep()

    // The toast is enough while they're looking at the page.
    if (permission.value !== 'granted' || document.visibilityState === 'visible') {
      return
    }
    const worker = await registration()
    await worker?.showNotification(item.title, {
      body: item.body,
      tag: item.tag,
      icon: '/favicon.ico',
      data: { url: item.url }
    })
  }

  return { permission, ready, enable, alert }
}
