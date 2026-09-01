const CACHE_NAME = 'tonight-cache-v2'
const AUTH_PATHS = ['/auth', '/login']
const APP_SHELL = [
  '/',
  '/tonight',
  '/post',
  '/profile',
  '/ranks',
  '/manifest.webmanifest',
  '/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  )
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

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  const isAuthPath = AUTH_PATHS.some((path) => requestUrl.pathname === path || requestUrl.pathname.startsWith(`${path}/`))

  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || isAuthPath) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request)
        .then((response) => {
          if (!response.ok) return response
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return response
        })
        .catch(() => event.request.mode === 'navigate' ? caches.match('/tonight') : Response.error())
    })
  )
})
