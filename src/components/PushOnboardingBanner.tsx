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

  const tipo = profile?.tipo_usuario;
  const isLojaUser =
    tipo === "loja" ||
    tipo === "colaborador" ||
    tipo === "supervisor" ||
    tipo === "gerente" ||
    tipo === "setor_operador" ||
    tipo === "setor_gestor";
  if (!isLojaUser) return null;
  if (subscribed === null) return null; // ainda checando
  if (subscribed) return null;

  const iosBlocked = iosNeedsInstall();

  async function handleSubscribe() {
    const res = await subscribe();
    if (res.ok) {
      toast.success("Notificações ativadas.");
    } else if (res.reason === "denied") {
      toast.error("Permissão negada. Ative nas configurações do navegador.");
    } else if (res.reason === "no-sw") {
      toast.error("O app ainda não conseguiu ativar o service worker. Reabra o app e tente novamente.");
    } else if (res.reason === "no-vapid-key") {
      toast.error("A chave de notificações não está configurada no app.");
    } else if (res.reason === "unsupported") {
      toast.error("Este navegador não suporta notificações push.");
    } else {
      toast.error(`Não foi possível ativar agora (${res.reason ?? "erro desconhecido"}).`);
    }
  }

  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-amber-500/40 bg-amber-500 px-4 pb-2 safe-top text-amber-950 shadow-soft">
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
