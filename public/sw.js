// Worker mínimo: limpa caches antigos de app-shell, ativa rápido e mantém suporte
// a notificações/push no app publicado sem registrar no preview.
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
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          await client.navigate(url);
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});
