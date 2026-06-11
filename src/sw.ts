/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

function isWorkboxCache(name: string) {
  return /(^|-)precache|(^|-)runtime|(^|-)workbox|(^|-)googleAnalytics/.test(name);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const targets = cacheNames.filter(isWorkboxCache);
        await Promise.allSettled(targets.map((name) => caches.delete(name)));
        await self.clients.claim();

        const windowClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        await Promise.allSettled(
          windowClients.map((client) => (client as WindowClient).navigate(client.url)),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});
