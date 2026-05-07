import { useEffect, useState } from "react";

/**
 * Detecta quando uma nova versão do app está disponível via Service Worker.
 *
 * Como o SW usa `skipWaiting` + `clients.claim()`, o novo SW assume imediatamente.
 * Escutamos:
 * - `controllerchange`: dispara quando o novo SW assume o controle da página atual
 *   (sinal claro de que há código novo carregado no SW e a página atual está velha).
 * - `updatefound` + state "installed": fallback caso skipWaiting demore.
 *
 * Ignoramos o primeiro `controllerchange` se não havia controller antes (primeira instalação).
 */
export function useAppUpdateAvailable(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    function markAvailable() {
      if (!cancelled) setUpdateAvailable(true);
    }

    // Se já há um SW instalado e ativo, qualquer controllerchange depois disso = update.
    const hadController = !!navigator.serviceWorker.controller;

    function onControllerChange() {
      if (hadController) markAvailable();
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    void navigator.serviceWorker.getRegistration().then((r) => {
      if (!r || cancelled) return;
      reg = r;

      // Já existe um SW esperando? Update pronto.
      if (r.waiting && navigator.serviceWorker.controller) {
        markAvailable();
      }

      r.addEventListener("updatefound", () => {
        const installing = r!.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            markAvailable();
          }
        });
      });
    });

    // Checa periodicamente se há update no servidor (a cada 30 min).
    const intervalId = window.setInterval(
      () => {
        reg?.update().catch(() => {});
      },
      30 * 60 * 1000,
    );

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return updateAvailable;
}
