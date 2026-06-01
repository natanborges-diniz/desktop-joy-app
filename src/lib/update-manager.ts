import { toast } from "sonner";

/**
 * Gerenciador de auto-update do PWA.
 *
 * Estratégia:
 * 1. Poll a cada 60s chamando registration.update() — pega builds novos
 *    mesmo quando o iOS não dispara focus/visibilitychange no standalone.
 * 2. Quando um SW novo entra em "waiting", mostra toast com "Atualizar agora".
 * 3. Se o usuário está ocioso há > 2min, recarrega sozinho (sem perder
 *    digitação). Caso contrário, espera o clique.
 */

const IDLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos
const POLL_INTERVAL_MS = 60 * 1000; // 1 minuto

let lastActivity = Date.now();
let updatePromptShown = false;

function markActivity() {
  lastActivity = Date.now();
}

function isUserIdle() {
  return Date.now() - lastActivity > IDLE_THRESHOLD_MS;
}

function trackActivity() {
  const events = ["mousedown", "keydown", "touchstart", "scroll"];
  events.forEach((evt) =>
    window.addEventListener(evt, markActivity, { passive: true }),
  );
}

function reloadNow() {
  // Limpa caches do workbox antes de recarregar, garantindo HTML fresco.
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
}

function promptUpdate(registration: ServiceWorkerRegistration) {
  if (updatePromptShown) return;
  updatePromptShown = true;

  const waiting = registration.waiting;
  if (!waiting) return;

  const apply = () => {
    // Pede pro SW novo assumir; o listener de controllerchange recarrega.
    waiting.postMessage({ type: "SKIP_WAITING" });
    // fallback caso o SW não use o message handler
    setTimeout(reloadNow, 1500);
  };

  // Se o usuário está ocioso, aplica sozinho.
  if (isUserIdle()) {
    apply();
    return;
  }

  toast("Nova versão disponível", {
    description: "Atualize para receber as últimas melhorias.",
    duration: Infinity,
    action: {
      label: "Atualizar",
      onClick: apply,
    },
  });

  // Re-checa periodicamente se o usuário ficou ocioso depois do toast.
  const idleCheck = setInterval(() => {
    if (isUserIdle()) {
      clearInterval(idleCheck);
      apply();
    }
  }, 30 * 1000);
}

export function initUpdateManager(registration: ServiceWorkerRegistration) {
  trackActivity();

  // Se já existe um SW esperando ao registrar, mostra prompt imediatamente.
  if (registration.waiting) {
    promptUpdate(registration);
  }

  // Detecta novos SWs sendo instalados.
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (
        installing.state === "installed" &&
        navigator.serviceWorker.controller
      ) {
        promptUpdate(registration);
      }
    });
  });

  // Poll a cada 60s — essencial no iOS standalone.
  setInterval(() => {
    registration.update().catch(() => {});
  }, POLL_INTERVAL_MS);

  // Também checa quando aba volta a ficar visível.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      registration.update().catch(() => {});
    }
  });
  window.addEventListener("focus", () => {
    registration.update().catch(() => {});
  });
}
