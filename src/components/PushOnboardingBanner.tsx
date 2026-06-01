import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { iosNeedsInstall } from "@/lib/push";

/**
 * Banner persistente para usuários do tipo "loja" enquanto não houver
 * subscription push ativa. Demandas urgentes dependem dele.
 */
export function PushOnboardingBanner() {
  const { profile } = useAuth();
  const { supported, permission, subscribed, loading, subscribe } = usePushSubscription();

  if (profile?.tipo_usuario !== "loja") return null;
  if (subscribed === null) return null; // ainda checando
  if (subscribed) return null;

  const iosBlocked = iosNeedsInstall();

  async function handleSubscribe() {
    const res = await subscribe();
    if (res.ok) {
      toast.success("Notificações ativadas.");
    } else if (res.reason === "denied") {
      toast.error("Permissão negada. Ative nas configurações do navegador.");
    } else {
      toast.error("Não foi possível ativar agora. Tente novamente.");
    }
  }

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-amber-500/40 bg-amber-500 px-4 py-2 text-amber-950 shadow-soft">
      <BellRing className="h-4 w-4 shrink-0 animate-pulse" />
      <p className="min-w-0 flex-1 text-sm font-medium">
        Ative as notificações para receber demandas urgentes.
      </p>
      {iosBlocked ? (
        <span className="shrink-0 rounded-md bg-amber-950/15 px-3 py-1 text-xs font-semibold">
          Instale o app primeiro
        </span>
      ) : !supported ? (
        <span className="shrink-0 rounded-md bg-amber-950/15 px-3 py-1 text-xs font-semibold">
          Sem suporte
        </span>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={loading || permission === "denied"}
          className="shrink-0 rounded-md bg-amber-950/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-amber-950/30 disabled:opacity-60"
        >
          {permission === "denied" ? "Bloqueado" : loading ? "Ativando..." : "Ativar"}
        </button>
      )}
    </div>
  );
}
