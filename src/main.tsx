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
  // Em produção, força os SWs antigos a buscarem o kill-switch em /sw.js.
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((registration) => {
        const scriptUrl =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          "";

        if (!scriptUrl.endsWith("/sw.js")) return;

        registration.update().catch((err) => {
          console.error("[SW] update failed:", err);
        });
      });
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
