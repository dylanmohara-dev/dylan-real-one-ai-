// Minimal service worker -- exists so the browser considers Dylan AI
// "installable" as a home-screen app (that requirement, not full offline
// support, is what was actually asked for this pass). It does not cache
// anything and does not intercept requests beyond the required fetch
// listener, so it can never serve stale data or hide a real network
// failure behind a fake cached response. A real offline-caching strategy
// is a separate, deliberate feature -- worth its own pass if Dylan
// actually wants the app usable with no signal at all, since caching the
// wrong things (e.g. a stale chat reply) would be worse than no caching.
const VERSION = 'dylan-ai-sw-v1'

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
