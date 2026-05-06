import { useEffect, useState } from "react";
import { Bell, Loader2, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AcaoAgendamentoButtons } from "@/components/AcaoAgendamentoButtons";

type NotifTipo =
  | "agendamento_novo_loja"
  | "agendamento_confirmado_loja"
  | "agendamento_confirmacao"
  | "cobranca_comparecimento_loja"
  | "cobranca_comparecimento_loja_2"
  | string;

type Notif = {
  id: string;
  titulo: string | null;
  mensagem: string | null;
  lida: boolean | null;
  created_at: string;
  tipo: NotifTipo | null;
  referencia_id: string | null;
};

const TIPOS_AGENDAMENTO = new Set([
  "agendamento_novo_loja",
  "agendamento_confirmado_loja",
  "agendamento_confirmacao",
  "cobranca_comparecimento_loja",
  "cobranca_comparecimento_loja_2",
]);

const TIPOS_COM_ACOES = new Set([
  "agendamento_confirmado_loja",
  "agendamento_confirmacao",
  "cobranca_comparecimento_loja",
  "cobranca_comparecimento_loja_2",
]);

function precisaAcaoFallback(n: { tipo: string | null; titulo: string | null; mensagem: string | null; referencia_id: string | null }): boolean {
  if (!n.referencia_id) return false;
  if (n.tipo && TIPOS_COM_ACOES.has(n.tipo)) return false;
  const txt = `${n.titulo ?? ""} ${n.mensagem ?? ""}`.toLowerCase();
  return /comparec/i.test(txt);
}

function tipoBadge(tipo: NotifTipo | null): { label: string; tone: string } | null {
  switch (tipo) {
    case "agendamento_novo_loja":
      return { label: "Novo agendamento", tone: "bg-primary/10 text-primary" };
    case "agendamento_confirmado_loja":
      return { label: "Cliente confirmou", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
    case "agendamento_confirmacao":
      return { label: "Confirme comparecimento", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "cobranca_comparecimento_loja":
      return { label: "Cobrança 1ª", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "cobranca_comparecimento_loja_2":
      return { label: "Cobrança 2ª", tone: "bg-red-500/15 text-red-700 dark:text-red-300" };
    default:
      return null;
  }
}

function fmtData(s?: string): string {
  if (!s) return "";
  try {
    return format(new Date(s), "dd/MM HH:mm");
  } catch {
    return s;
  }
}

export default function NotificacoesList() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("notificacoes")
      .select("id,titulo,mensagem,lida,created_at,tipo,referencia_id")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as unknown as Notif[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-list-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
          filter: `usuario_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function marcarLida(id: string) {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Avisos</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">Notificações e atualizações</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-2 text-center">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sem avisos por aqui.</p>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-2xl gap-2">
            {items.map((n) => {
              const isAg = n.tipo && TIPOS_AGENDAMENTO.has(n.tipo);
              const showActions =
                n.tipo && TIPOS_COM_ACOES.has(n.tipo) && n.referencia_id;
              const badge = tipoBadge(n.tipo);
              return (
                <li key={n.id}>
                  <Card className="flex items-start gap-3 p-4 shadow-soft">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      {isAg ? <CalendarClock className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {n.titulo ?? "Aviso"}
                        </p>
                        {badge && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.tone}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      {n.mensagem && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>
                      )}
                      {showActions && (
                        <AcaoAgendamentoButtons
                          agendamentoId={n.referencia_id!}
                          onDone={() => void marcarLida(n.id)}
                        />
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), {
                          locale: ptBR,
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!n.lida && (
                      <button
                        onClick={() => void marcarLida(n.id)}
                        className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-label="Marcar como lida"
                      />
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
