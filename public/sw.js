// Service worker mínimo para o InFoco Message.
// SW_VERSION: bump esta string pra forçar reinstalação + limpeza total de cache.
const SW_VERSION = "2026-06-27-auto-update";

function isWorkboxCache(name) {
  return /(^|-)precache|(^|-)runtime|(^|-)workbox|(^|-)googleAnalytics/.test(name);
}

self.addEventListener("install", () => {
  // Atualização automática: assume controle assim que instalar,
  // sem esperar o usuário clicar em "Recarregar".
  self.skipWaiting();
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
        // Limpa TODOS os caches pra garantir bundle fresco nesta versão.
        const cacheNames = await caches.keys();
        await Promise.allSettled(cacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
        console.log("[SW] activated", SW_VERSION);
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
