import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useAppUpdateAvailable } from "@/hooks/useAppUpdateAvailable";

export function UpdateAvailableBanner() {
  const updateAvailable = useAppUpdateAvailable();
  const [applying, setApplying] = useState(false);

  if (!updateAvailable) return null;

  async function recarregar() {
    setApplying(true);
    try {
      // Pede pro SW em espera assumir o controle. O listener
      // 'controllerchange' (em main.tsx) cuida do reload em si.
      const reg = await navigator.serviceWorker?.getRegistration();
      const waiting = reg?.waiting;
      if (waiting) {
        waiting.postMessage({ type: "SKIP_WAITING" });
        // Fallback: se em 2s nada acontecer, força reload.
        setTimeout(() => window.location.reload(), 2000);
        return;
      }
      // Sem SW em espera → limpa caches e recarrega direto.
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-primary/40 bg-primary px-4 py-2 text-primary-foreground shadow-soft">
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
      <p className="min-w-0 flex-1 text-sm font-medium">
        Nova versão disponível — recarregue para atualizar.
      </p>
      <button
        onClick={recarregar}
        disabled={applying}
        className="shrink-0 rounded-md bg-background/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-background/30 disabled:opacity-60"
      >
        {applying ? "Atualizando..." : "Recarregar"}
      </button>
    </div>
  );
}
