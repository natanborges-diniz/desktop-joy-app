// Service worker mínimo para o InFoco Message.
// SW_VERSION: bump esta string pra forçar reinstalação + limpeza total de cache.
const SW_VERSION = "2026-06-12-fix-solicitacao-anexos";

function isWorkboxCache(name) {
  return /(^|-)precache|(^|-)runtime|(^|-)workbox|(^|-)googleAnalytics/.test(name);
}

self.addEventListener("install", () => {
  // Não chamamos skipWaiting aqui — esperamos o usuário clicar em "Recarregar".
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const targets = cacheNames.filter(isWorkboxCache);
        await Promise.allSettled(targets.map((name) => caches.delete(name)));
        await self.clients.claim();
      } catch {
        // ignore
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
