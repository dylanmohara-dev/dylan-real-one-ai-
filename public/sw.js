// Minimal service worker -- exists so the browser considers Dylan AI
// "installable" as a home-screen app, and (as of this version) so it can
// receive and display real push notifications. It still does not cache
// anything and does not intercept ordinary page requests beyond passing
// them straight through -- a real offline-caching strategy is a separate,
// deliberate feature, since caching the wrong thing (a stale chat reply)
// would be worse than no caching at all.
const VERSION = 'dylan-ai-sw-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Pass every request straight through to the network, unmodified.
  event.respondWith(fetch(event.request))
})

// The actual "show a notification" handler. `event.data` is the exact
// binary payload lib/webPush.js's sendPushNotification() encrypted and
// sent -- the browser has already decrypted it by the time this fires,
// so this just reads it back out as the plain JSON object the server
// sent ({ title, body, tag }).
self.addEventListener('push', (event) => {
  let payload = { title: 'Dylan AI', body: 'You have a new notification.' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    // A malformed/undecryptable payload shouldn't crash the whole handler
    // and leave nothing shown -- fall back to a generic notification
    // rather than silently showing nothing at all.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Dylan AI', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag = the OS replaces rather than stacks a duplicate
      // notification for the same underlying event (see
      // lib/notificationTriggers.js's per-item `tag`), so a scheduler
      // tick re-checking the same not-yet-cleared reminder can never
      // pile up multiple copies on the lock screen.
      tag: payload.tag || undefined,
    })
  )
})

// Tapping a notification should bring Dylan back into the app (focusing
// an already-open tab/PWA window rather than opening a duplicate one),
// not just dismiss it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
      return undefined
    })
  )
})
