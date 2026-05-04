// Notificação local emitida pelo próprio app (via Service Worker, quando disponível)
// para complementar o push real do servidor.
//
// Comportamento:
// - Só dispara se o usuário já permitiu notificações (Notification.permission === "granted").
// - NÃO dispara se a aba do app está visível na rota relevante (evita duplicar quando o
//   usuário já está olhando para a conversa/agenda/avisos).
// - Usa registration.showNotification quando há SW registrado, para que o clique passe
//   pelo mesmo handler `notificationclick` do push real (`src/sw.ts`). Faz fallback para
//   `new Notification(...)` quando o SW não está disponível (ex.: navegador sem PWA).

export type LocalNotifyOptions = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  /**
   * Se a rota atual (window.location.pathname) começar com algum desses prefixos
   * E a aba estiver visível, a notificação é suprimida (o usuário já está vendo).
   * Ex.: na conversa /conversas/123, suprimir mensagens daquela mesma conversa.
   */
  suppressWhenOnPathPrefixes?: string[];
};

function tabIsVisible(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

function pathMatchesAny(prefixes: string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return false;
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  return prefixes.some((p) => path === p || path.startsWith(p));
}

export async function showLocalNotification(opts: LocalNotifyOptions): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // Se o usuário já está vendo a tela relevante, não notificar.
  if (tabIsVisible() && pathMatchesAny(opts.suppressWhenOnPathPrefixes)) return;

  const title = opts.title;
  const options: NotificationOptions = {
    body: opts.body ?? "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: opts.tag,
    data: { url: opts.url ?? "/" },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    }
    // Fallback sem SW (ex.: browser desktop sem PWA registrada).
    new Notification(title, options);
  } catch (err) {
    console.warn("[localNotify] falhou:", err);
  }
}
