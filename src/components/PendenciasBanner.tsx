import { Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePendenciasCount } from "@/hooks/usePendenciasCount";
import { usePendenciasReminder } from "@/hooks/usePendenciasReminder";

export function PendenciasBanner() {
  const count = usePendenciasCount();
  const navigate = useNavigate();
  const location = useLocation();
  usePendenciasReminder(count);

  if (count <= 0) return null;
  // Já está na tela de avisos: não precisa empurrar mais.
  if (location.pathname.startsWith("/notificacoes")) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-destructive/40 bg-destructive px-4 pb-2 safe-top text-destructive-foreground shadow-soft">
      <Bell className="h-4 w-4 shrink-0 animate-pulse" />
      <p className="min-w-0 flex-1 text-sm font-medium">
        Você tem {count} aviso{count > 1 ? "s" : ""} pendente{count > 1 ? "s" : ""}. Resolva agora.
      </p>
      <button
        onClick={() => navigate("/notificacoes")}
        className="shrink-0 rounded-md bg-background/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-background/25"
      >
        Ver avisos
      </button>
    </div>
  );
}
