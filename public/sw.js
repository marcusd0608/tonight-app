const CACHE_NAME = 'tonight-static-v4'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Tonight'
  const options = {
    body: data.body || 'You have a new Tonight notification.',
    icon: data.icon || '/icon-192.svg',
    badge: data.badge || '/icon-192.svg',
    data: { url: data.url || '/tonight' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/tonight'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((window) => 'focus' in window)
    if (existing) return existing.focus().then(() => existing.navigate(url))
    return clients.openWindow(url)
  }))
})

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  const cacheableDestinations = ['style', 'script', 'image', 'font']

  if (
    event.request.method !== 'GET' ||
    requestUrl.origin !== self.location.origin ||
    !cacheableDestinations.includes(event.request.destination)
  ) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request)
        .then((response) => {
          if (!response.ok) return response
          const responseClone = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return response
        })
        .catch(() => Response.error())
    })
  )
})
