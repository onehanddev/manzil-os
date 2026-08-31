/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as { title?: string; body?: string; click_action?: string } | undefined
  event.waitUntil(self.registration.showNotification(payload?.title ?? 'Daily Report', {
    body: payload?.body ?? 'Your daily cashbook report is ready.',
    data: { click_action: payload?.click_action ?? '/reports?from=today&to=today' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data.click_action))
})
