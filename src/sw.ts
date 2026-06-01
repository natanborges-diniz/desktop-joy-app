/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// Auto-update + skip waiting
self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Workbox precache (gerado pelo plugin)
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback — exclui /~oauth e qualquer rota de auth
registerRoute(
  new NavigationRoute(new NetworkFirst({ cacheName: "pages" }), {
    denylist: [/^\/~oauth/, /^\/auth/, /\/api\//],
  }),
);

// ============ Web Push ============
self.addEventListener("push", (event: PushEvent) => {
  let payload: {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    icon?: string;
    badge?: string;
  } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }

  const title = payload.title || "InFoco Message";
  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag,
    // Cada nível de SLA (sla_t15_*, sla_t30_*, sla_t60_*) é uma tag distinta,
    // mas garantimos renotify para que o usuário sempre seja avisado de novo.
    renotify: true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Foca janela já aberta do app, se houver
      for (const client of allClients) {
        if ("focus" in client) {
          await (client as WindowClient).focus();
          await (client as WindowClient).navigate(targetUrl).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
