import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2, CalendarClock, X as XIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AcaoAgendamentoButtons } from "@/components/AcaoAgendamentoButtons";
import { cn } from "@/lib/utils";
import { resolveNotifLink } from "@/lib/notifLinks";


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

export default function NotificacoesList() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isLoja = (profile?.tipo_usuario ?? "").toLowerCase() === "loja";
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [verLidas, setVerLidas] = useState(false);

  async function abrirNotificacao(n: Notif) {
    if (!n.lida) {
      void supabase.from("notificacoes").update({ lida: true }).eq("id", n.id);
      setItems((prev) =>
        verLidas
          ? prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x))
          : prev.filter((x) => x.id !== n.id),
      );
    }
    const url = resolveNotifLink(
      { tipo: n.tipo, referencia_id: n.referencia_id, titulo: n.titulo, mensagem: n.mensagem },
      isLoja,
    );
    if (url && url !== "/notificacoes") navigate(url);
  }



  async function load() {
    if (!user) return;
    let q = supabase
      .from("notificacoes")
      .select("id,titulo,mensagem,lida,created_at,tipo,referencia_id")
      .eq("usuario_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!verLidas) q = q.eq("lida", false);
    const { data } = await q;
    setItems((data ?? []) as unknown as Notif[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, verLidas]);

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
  }, [user, verLidas]);

  async function marcarLida(id: string) {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
    setItems((prev) => prev.filter((n) => n.id !== id || verLidas).map((n) =>
      n.id === id ? { ...n, lida: true } : n,
    ));
  }

  // Marca como lidas TODAS as notificações de um mesmo agendamento
  // (ex.: 1ª e 2ª cobrança somem juntas quando a ação é registrada).
  async function marcarLidaPorAgendamento(agendamentoId: string) {
    if (!user) return;
    await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("usuario_id", user.id)
      .eq("referencia_id", agendamentoId)
      .eq("lida", false);
    setItems((prev) =>
      verLidas
        ? prev.map((n) => (n.referencia_id === agendamentoId ? { ...n, lida: true } : n))
        : prev.filter((n) => n.referencia_id !== agendamentoId),
    );
  }

  // Deduplica por referencia_id (agendamento) — mantém só a notificação mais
  // recente do grupo. As antigas são marcadas como lidas em background para
  // não poluírem a lista futuramente.
  const visibleItems = useMemo(() => {
    const seen = new Map<string, Notif>();
    const result: Notif[] = [];
    const toMarkLida: string[] = [];
    for (const n of items) {
      const groupKey =
        n.referencia_id && n.tipo && TIPOS_COM_ACOES.has(n.tipo)
          ? `ag:${n.referencia_id}`
          : `id:${n.id}`;
      const existing = seen.get(groupKey);
      if (!existing) {
        seen.set(groupKey, n);
        result.push(n);
      } else {
        // já temos algo mais recente — esconder esta e marcar como lida
        if (!n.lida) toMarkLida.push(n.id);
      }
    }
    if (toMarkLida.length > 0) {
      void supabase
        .from("notificacoes")
        .update({ lida: true })
        .in("id", toMarkLida);
    }
    return result;
  }, [items]);

  const pendentesCount = useMemo(
    () => items.filter((n) => !n.lida).length,
    [items],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Avisos</h1>
          <button
            type="button"
            onClick={() => setVerLidas((v) => !v)}
            className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-header-foreground backdrop-blur hover:bg-white/25"
          >
            {verLidas ? "Ver pendentes" : "Ver lidas"}
          </button>
        </div>
        <p className="pb-3 text-sm text-white/80">
          {verLidas
            ? "Histórico de notificações já lidas"
            : `${pendentesCount} pendência${pendentesCount === 1 ? "" : "s"}`}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-2 text-center">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {verLidas ? "Sem avisos lidos." : "Tudo em dia! Sem pendências."}
            </p>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-2xl gap-2">
            {visibleItems.map((n) => {
              const isAg = n.tipo && TIPOS_AGENDAMENTO.has(n.tipo);
              const showActions =
                ((n.tipo && TIPOS_COM_ACOES.has(n.tipo) && n.referencia_id) ||
                  precisaAcaoFallback(n)) &&
                !n.lida;
              const badge = tipoBadge(n.tipo);
              return (
                <li key={n.id}>
                  <Card
                    onClick={() => void abrirNotificacao(n)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void abrirNotificacao(n);
                      }
                    }}
                    className={cn(
                      "relative flex cursor-pointer items-start gap-3 p-4 shadow-soft transition-shadow hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-primary",
                      n.lida && "opacity-60",
                    )}
                  >

                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      {isAg ? <CalendarClock className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 pr-6">
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
                        <div onClick={(e) => e.stopPropagation()}>
                          <AcaoAgendamentoButtons
                            agendamentoId={n.referencia_id!}
                            onDone={() => void marcarLidaPorAgendamento(n.referencia_id!)}
                          />
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), {
                            locale: ptBR,
                            addSuffix: true,
                          })}
                        </p>
                        {!n.lida && !showActions && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void marcarLida(n.id);
                            }}
                            className="rounded-md border border-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                          >
                            Marcar como lida
                          </button>
                        )}
                      </div>
                    </div>
                    {!n.lida && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void (n.referencia_id && showActions
                            ? marcarLidaPorAgendamento(n.referencia_id)
                            : marcarLida(n.id));
                        }}
                        aria-label="Dispensar aviso"
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
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
