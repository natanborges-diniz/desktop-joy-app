import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ============ Service Worker registration with safety guards ============
// SW NÃO deve registrar dentro do iframe do editor Lovable (quebra preview).
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

if (isInIframe || isPreviewHost) {
  // Desregistra qualquer SW que tenha sobrado, evita cache poluindo o preview.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
} else if ("serviceWorker" in navigator) {
  // Em produção real (desktop-joy-app.lovable.app etc.), registra o SW.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { type: "classic" })
      .then((registration) => {
        // Checa atualizações sempre que a aba ganha foco — importante no iOS PWA.
        const checkForUpdate = () => {
          registration.update().catch(() => {});
        };
        window.addEventListener("focus", checkForUpdate);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
      })
      .catch((err) => console.error("[SW] register failed:", err));

    // Quando um novo SW assume controle, recarrega para pegar bundle novo.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
