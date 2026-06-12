// Kill-switch service worker: limpa caches antigos do Workbox e se desregistra.
function isWorkboxCache(name) {
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
          windowClients.map((client) => client.navigate(client.url)),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});
