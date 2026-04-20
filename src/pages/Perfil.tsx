import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, BellOff, LogOut, Mail, Briefcase, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  isPushSupported,
  isSubscribed,
  subscribePush,
  unsubscribePush,
  getPermission,
  iosNeedsInstall,
} from "@/lib/push";
import { supabase } from "@/integrations/supabase/client";

export default function Perfil() {
  const { profile, user, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    toast.success("Sessão encerrada");
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Perfil</h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        <div className="mx-auto max-w-md space-y-4">
          <Card className="flex flex-col items-center gap-3 p-6 text-center shadow-soft">
            <UserAvatar
              nome={profile?.nome}
              email={profile?.email ?? user?.email}
              url={profile?.avatar_url}
              size="lg"
            />
            <div>
              <p className="text-lg font-semibold text-foreground">
                {profile?.nome || user?.email || "Usuário"}
              </p>
              {profile?.cargo && <p className="text-sm text-muted-foreground">{profile.cargo}</p>}
            </div>
          </Card>

          <Card className="divide-y divide-border shadow-soft">
            <Row icon={<Mail className="h-4 w-4" />} label="E-mail" value={profile?.email ?? user?.email ?? "—"} />
            {profile?.cargo && (
              <Row icon={<Briefcase className="h-4 w-4" />} label="Cargo" value={profile.cargo} />
            )}
          </Card>

          <NotificacoesCard />

          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Infoco Messenger · v0.1
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

function NotificacoesCard() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  async function refresh() {
    const sup = isPushSupported();
    setSupported(sup);
    setNeedsInstall(iosNeedsInstall());
    if (!sup) return;
    setPermission(getPermission());
    setSubscribed(await isSubscribed());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleEnable() {
    setLoading(true);
    const result = await subscribePush();
    setLoading(false);
    if (result.ok) {
      toast.success("Notificações ativadas neste dispositivo");
      await refresh();
    } else {
      const map: Record<string, string> = {
        unsupported: "Seu navegador não suporta notificações push",
        "no-vapid-key": "Configuração de push ausente — contate o admin",
        denied: "Permissão negada. Ative nas configurações do navegador.",
        "no-sw": "Service Worker não está ativo. Tente recarregar a página.",
        "no-keys": "Falha ao gerar chaves de assinatura",
        "no-user": "Você precisa estar logado",
      };
      toast.error(map[result.reason ?? ""] ?? `Falha ao ativar (${result.reason})`);
    }
  }

  async function handleDisable() {
    setLoading(true);
    await unsubscribePush();
    setLoading(false);
    toast.success("Notificações desativadas neste dispositivo");
    await refresh();
  }

  async function handleTest() {
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("send-test-push");
      if (error) throw error;
      toast.success("Notificação de teste enviada — confira em alguns segundos");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      toast.error(`Falha no teste: ${msg}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="space-y-3 p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Notificações push</h2>
      </div>

      {!supported && (
        <p className="text-sm text-muted-foreground">
          Seu navegador não suporta notificações push. Tente em um Chrome/Edge atualizado ou
          instale o app no celular.
        </p>
      )}

      {supported && needsInstall && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Smartphone className="h-4 w-4" />
            Instale o app primeiro
          </div>
          <p className="text-muted-foreground">
            No iPhone, abra esta página no <strong>Safari</strong>, toque no botão Compartilhar
            e selecione <strong>"Adicionar à Tela de Início"</strong>. Depois abra o app
            instalado e volte aqui para ativar as notificações.
          </p>
        </div>
      )}

      {supported && !needsInstall && permission === "denied" && (
        <p className="text-sm text-muted-foreground">
          Você bloqueou as notificações. Para reativar, libere nas configurações do
          navegador/sistema e recarregue a página.
        </p>
      )}

      {supported && !needsInstall && permission !== "denied" && (
        <>
          {subscribed ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ✅ Notificações ativas neste dispositivo. Você receberá avisos mesmo com o app
                fechado.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleTest} disabled={testing}>
                  {testing ? "Enviando…" : "Enviar teste"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDisable}
                  disabled={loading}
                  className="text-muted-foreground"
                >
                  <BellOff className="h-3.5 w-3.5" />
                  Desativar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Receba avisos de novas mensagens, demandas e notificações mesmo com o app
                fechado.
              </p>
              <Button onClick={handleEnable} disabled={loading} className="w-full">
                <Bell className="h-4 w-4" />
                {loading ? "Ativando…" : "Ativar notificações"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
