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
  // Quando o novo SW assume o controle (após SKIP_WAITING), recarrega a página
  // para que o usuário pegue o código novo imediatamente.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/sw.js?v=2026-06-27-auto-update", { scope: "/" })
    .then((registration) => {
      registration.update().catch(() => undefined);
      // Checa por updates a cada 60s — importante no iOS standalone.
      setInterval(() => registration.update().catch(() => undefined), 60_000);
    })
    .catch((err) => {
      console.error("[SW] register failed:", err);
    });
}

createRoot(document.getElementById("root")!).render(<App />);
