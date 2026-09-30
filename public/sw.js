// Trimly service worker: lets pages show notifications on Android (which only
// allows them through a service worker) and focuses the right page on tap.
// No caching, no push handling yet.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(client => client.url === url) || windows[0]
    if (open) {
      await open.focus()
      if (open.url !== url && 'navigate' in open) {
        await open.navigate(url)
      }
      return
    }
    await self.clients.openWindow(url)
  })())
})
