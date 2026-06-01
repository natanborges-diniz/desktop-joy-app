import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initUpdateManager } from "./lib/update-manager";

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
        initUpdateManager(registration);
      })
      .catch((err) => console.error("[SW] register failed:", err));

    // Quando o SW novo assume controle (após SKIP_WAITING), recarrega.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
