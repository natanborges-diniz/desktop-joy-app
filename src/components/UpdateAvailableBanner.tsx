import { RefreshCw } from "lucide-react";
import { useAppUpdateAvailable } from "@/hooks/useAppUpdateAvailable";

export function UpdateAvailableBanner() {
  const updateAvailable = useAppUpdateAvailable();

  if (!updateAvailable) return null;

  function recarregar() {
    window.location.reload();
  }

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-primary/40 bg-primary px-4 py-2 text-primary-foreground shadow-soft">
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
      <p className="min-w-0 flex-1 text-sm font-medium">
        Nova versão disponível — recarregue para atualizar.
      </p>
      <button
        onClick={recarregar}
        className="shrink-0 rounded-md bg-background/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-background/30"
      >
        Recarregar
      </button>
    </div>
  );
}
