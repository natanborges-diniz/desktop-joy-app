import { useEffect } from "react";

/**
 * Polling paralelo ao Service Worker: consulta /version.json a cada 60s
 * (cache: 'no-store') e compara com o BUILD_ID embutido no bundle.
 *
 * Se o servidor já tem BUILD_ID diferente:
 * 1. Tenta destravar via SW (`update()` + `SKIP_WAITING`).
 * 2. Marca `window.__lovableUpdateAvailable` pra o banner aparecer.
 * 3. Se depois de 5s ainda não recarregou, força reload + limpa caches.
 *
 * Isso resolve o caso do iOS PWA que segura o sw.js no cache HTTP.
 */
const CURRENT_BUILD_ID =
  (import.meta.env.VITE_BUILD_ID as string | undefined) ?? "dev";

async function clearCachesAndReload() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function useBuildVersionCheck() {
  useEffect(() => {
    if (CURRENT_BUILD_ID === "dev") return;
    let cancelled = false;
    let notified = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (cancelled || !data.buildId) return;
        if (data.buildId === CURRENT_BUILD_ID) return;

        if (notified) return;
        notified = true;

        // Dispara evento para o banner reagir imediatamente.
        window.dispatchEvent(new CustomEvent("lovable:update-available"));

        // Tenta destravar via Service Worker.
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          await reg?.update();
          if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } catch {
          /* ignore */
        }

        // Fallback: se em 8s ainda estamos aqui, força reload.
        setTimeout(() => {
          if (!cancelled) void clearCachesAndReload();
        }, 8000);
      } catch {
        /* offline / ignore */
      }
    }

    void check();
    const id = window.setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
}
