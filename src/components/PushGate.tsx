import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { iosNeedsInstall } from "@/lib/push";
import { Button } from "@/components/ui/button";

/**
 * Bloqueia a rota até que a subscription push esteja ativa.
 * Aplica-se apenas a usuários do tipo "loja".
 */
export function PushGate({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { supported, permission, subscribed, loading, subscribe } = usePushSubscription();

  if (profile?.tipo_usuario !== "loja") return <>{children}</>;
  if (subscribed === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (subscribed && permission === "granted") return <>{children}</>;

  const iosBlocked = iosNeedsInstall();

  async function handle() {
    const res = await subscribe();
    if (res.ok) toast.success("Notificações ativadas.");
    else if (res.reason === "denied")
      toast.error("Permissão negada. Ative nas configurações do navegador.");
    else toast.error("Não foi possível ativar agora.");
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-muted px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
        <BellRing className="h-8 w-8" />
      </div>
      <h2 className="max-w-md text-lg font-semibold text-foreground">
        Ative as notificações para acessar suas demandas
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Demandas têm SLA. Sem notificações você pode perder prazos críticos.
      </p>
      {iosBlocked ? (
        <p className="max-w-md rounded-md bg-amber-500/15 px-4 py-3 text-sm text-amber-900">
          No iPhone/iPad é preciso instalar o app na tela inicial primeiro
          (Compartilhar → Adicionar à Tela de Início).
        </p>
      ) : !supported ? (
        <p className="text-sm text-destructive">Seu navegador não suporta notificações push.</p>
      ) : permission === "denied" ? (
        <p className="max-w-md text-sm text-destructive">
          Permissão bloqueada. Abra as configurações do site no seu navegador e permita
          notificações para este app, depois recarregue a página.
        </p>
      ) : (
        <Button size="lg" onClick={handle} disabled={loading}>
          {loading ? "Ativando..." : "Ativar agora"}
        </Button>
      )}
    </div>
  );
}
