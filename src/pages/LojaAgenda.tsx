import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  List as ListIcon,
  Phone,
  FileText,
  DollarSign,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { showLocalNotification } from "@/lib/localNotify";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AcaoAgendamentoButtons } from "@/components/AcaoAgendamentoButtons";

type Agendamento = {
  id: string;
  contato_id: string;
  loja_nome: string;
  data_horario: string;
  status: string;
  observacoes: string | null;
  lembrete_enviado: boolean | null;
  loja_confirmou_presenca: boolean | null;
  valor_orcamento: number | null;
  valor_venda: number | null;
  numero_venda: string | null;
  numeros_os: string[] | null;
  metadata: Record<string, unknown> | null;
  contato?: { nome: string | null; telefone: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  lembrete_enviado: "Lembrete enviado",
  confirmado: "Confirmado",
  compareceu: "Compareceu",
  no_show: "Não compareceu",
  cancelado: "Cancelado",
  reagendado: "Reagendado",
};

function statusTone(s: string): string {
  switch (s) {
    case "compareceu":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "confirmado":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    case "lembrete_enviado":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20";
    case "no_show":
      return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20";
    case "cancelado":
      return "bg-muted text-muted-foreground border-border";
    case "reagendado":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
    default:
      return "bg-primary/10 text-primary border-primary/20";
  }
}

function dotByStatus(s: string): string {
  switch (s) {
    case "compareceu":
    case "confirmado":
      return "bg-emerald-500";
    case "lembrete_enviado":
      return "bg-sky-500";
    case "no_show":
      return "bg-red-500";
    case "cancelado":
      return "bg-muted-foreground/40";
    case "reagendado":
      return "bg-amber-500";
    default:
      return "bg-primary";
  }
}

function formatPhone(t: string | null | undefined): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  if (d.length < 10) return t;
  const ddd = d.slice(-11, -9);
  const a = d.slice(-9, -4);
  const b = d.slice(-4);
  return `(${ddd}) ${a}-${b}`;
}

function formatBRL(n: number | null | undefined): string {
  if (n == null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n));
}

export default function LojaAgenda() {
  const navigate = useNavigate();
  const { lojaNome: lojaCtx, podeMenuLoja, loading: ctxLoading } = useLojaContext();
  const { lojaSelecionada, lojasFiltro, lojasDoUsuario } = useFiltroLoja();
  // Fonte da verdade da loja ativa na Agenda: chip do filtro > loja do contexto legado.
  // Quando o usuário multi-loja está em "Todas", mostramos todas as lojas dele combinadas.
  const lojaNome = lojaSelecionada ?? lojaCtx;
  const lojasQuery: string[] = lojaSelecionada
    ? [lojaSelecionada]
    : lojasDoUsuario.length > 0
      ? lojasFiltro
      : lojaCtx
        ? [lojaCtx]
        : [];
  const lojasKey = lojasQuery.join("|");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [view, setView] = useState<"month" | "list">("month");
  const [items, setItems] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<Agendamento | null>(null);

  const intervalStart = useMemo(
    () => startOfWeek(startOfMonth(cursor), { locale: ptBR }),
    [cursor],
  );
  const intervalEnd = useMemo(() => endOfWeek(endOfMonth(cursor), { locale: ptBR }), [cursor]);

  async function load() {
    if (lojasQuery.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const fromIso = (view === "list" ? new Date() : intervalStart).toISOString();
    const toIso =
      view === "list"
        ? new Date(Date.now() + 30 * 86400000).toISOString()
        : intervalEnd.toISOString();
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id,contato_id,loja_nome,data_horario,status,observacoes,lembrete_enviado,loja_confirmou_presenca,valor_orcamento,valor_venda,numero_venda,numeros_os,metadata,contato:contatos(nome,telefone)",
      )
      .in("loja_nome", lojasQuery)
      .gte("data_horario", fromIso)
      .lte("data_horario", toIso)
      .order("data_horario", { ascending: true });
    if (!error) setItems(((data ?? []) as unknown) as Agendamento[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojasKey, cursor, view]);

  // realtime
  useEffect(() => {
    if (lojasQuery.length === 0) return;
    const filter =
      lojasQuery.length === 1
        ? `loja_nome=eq.${lojasQuery[0]}`
        : `loja_nome=in.(${lojasQuery.map((l) => `"${l.replace(/"/g, '\\"')}"`).join(",")})`;
    const ch = supabase
      .channel(`agenda-${lojasKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter,
        },
        (payload) => {
          void load();
          if (payload.eventType === "INSERT") {
            const row = payload.new as {
              id: string;
              data_horario: string;
              contato_id?: string;
            };
            const quando = (() => {
              try {
                return format(new Date(row.data_horario), "dd/MM HH:mm");
              } catch {
                return "";
              }
            })();
            void showLocalNotification({
              title: "Novo agendamento",
              body: quando ? `Cliente agendado para ${quando}` : "Novo agendamento criado",
              url: "/agenda",
              tag: `ag-${row.id}`,
              suppressWhenOnPathPrefixes: ["/agenda"],
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojasKey]);

  const days = useMemo(
    () => eachDayOfInterval({ start: intervalStart, end: intervalEnd }),
    [intervalStart, intervalEnd],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    for (const a of items) {
      const key = format(new Date(a.data_horario), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  const selectedKey = format(selectedDay, "yyyy-MM-dd");
  const dayItems = view === "month" ? byDay.get(selectedKey) ?? [] : items;

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center gap-2 md:h-16">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-1.5 hover:bg-white/15"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold md:text-lg">Agenda</h1>
            {(() => {
              const sub = lojaSelecionada
                ? lojaSelecionada
                : lojasDoUsuario.length > 1
                  ? `Todas (${lojasDoUsuario.length} lojas)`
                  : lojaCtx;
              return sub ? <p className="truncate text-xs text-white/80">{sub}</p> : null;
            })()}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={view === "month" ? "secondary" : "ghost"}
              className={view === "month" ? "" : "text-white hover:bg-white/15"}
              onClick={() => setView("month")}
            >
              <CalendarDays className="mr-1 h-4 w-4" /> Mês
            </Button>
            <Button
              size="sm"
              variant={view === "list" ? "secondary" : "ghost"}
              className={view === "list" ? "" : "text-white hover:bg-white/15"}
              onClick={() => setView("list")}
            >
              <ListIcon className="mr-1 h-4 w-4" /> Lista
            </Button>
          </div>
        </div>
        <div className="pb-3" />
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin">
        <div className="mx-auto max-w-2xl p-4">
          {ctxLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !podeMenuLoja ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Apenas usuários do tipo <strong>loja</strong> ou <strong>colaborador</strong> podem
              ver a agenda.
            </p>
          ) : lojasQuery.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              Loja não identificada para o seu perfil.
            </p>
          ) : view === "month" ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={() => setCursor((c) => subMonths(c, 1))}
                  className="rounded-full p-1.5 hover:bg-muted"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    const t = new Date();
                    setCursor(t);
                    setSelectedDay(t);
                  }}
                  className="text-sm font-semibold capitalize hover:text-primary"
                >
                  {format(cursor, "MMMM yyyy", { locale: ptBR })}
                </button>
                <button
                  onClick={() => setCursor((c) => addMonths(c, 1))}
                  className="rounded-full p-1.5 hover:bg-muted"
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="rounded-xl border border-border bg-card p-2 shadow-soft">
                <div className="grid grid-cols-7 gap-1 px-1 pb-1">
                  {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
                    <p
                      key={d}
                      className="text-center text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {d}
                    </p>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const key = format(d, "yyyy-MM-dd");
                    const ag = byDay.get(key) ?? [];
                    const inMonth = isSameMonth(d, cursor);
                    const sel = isSameDay(d, selectedDay);
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDay(d)}
                        className={cn(
                          "relative flex aspect-square min-h-[44px] flex-col items-center justify-start gap-0.5 rounded-md p-1 text-xs transition-colors",
                          inMonth ? "text-foreground" : "text-muted-foreground/40",
                          sel ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                          isToday(d) && !sel && "ring-1 ring-primary",
                        )}
                      >
                        <span>{format(d, "d")}</span>
                        {ag.length > 0 && (
                          <div className="flex items-center gap-0.5">
                            {ag.slice(0, 3).map((a) => (
                              <span
                                key={a.id}
                                className={cn("h-1.5 w-1.5 rounded-full", dotByStatus(a.status))}
                              />
                            ))}
                            {ag.length > 3 && (
                              <span className="text-[9px]">+{ag.length - 3}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold capitalize text-foreground">
                  {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
                {loading ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : dayItems.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Sem agendamentos neste dia.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dayItems.map((a) => (
                      <CardAgendamento key={a.id} a={a} onOpen={() => setAberto(a)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : items.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum agendamento nos próximos 30 dias.
                </p>
              ) : (
                items.map((a) => (
                  <CardAgendamento key={a.id} a={a} onOpen={() => setAberto(a)} mostrarData />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          {aberto && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {aberto.contato?.nome ?? "Cliente"} ·{" "}
                  {format(new Date(aberto.data_horario), "dd/MM HH:mm")}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    statusTone(aberto.status),
                  )}
                >
                  {STATUS_LABEL[aberto.status] ?? aberto.status}
                </span>
                {aberto.contato?.telefone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" /> {formatPhone(aberto.contato.telefone)}
                  </div>
                )}
                {aberto.observacoes && (
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" /> Resumo do atendimento
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {aberto.observacoes}
                    </p>
                  </div>
                )}
                {(aberto.valor_orcamento != null || aberto.valor_venda != null) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border p-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" /> Orçamento
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatBRL(aberto.valor_orcamento)}
                      </p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" /> Venda
                      </p>
                      <p className="mt-1 text-sm font-semibold">{formatBRL(aberto.valor_venda)}</p>
                    </div>
                  </div>
                )}
                {aberto.numero_venda && (
                  <p className="text-xs text-muted-foreground">
                    Venda nº <span className="font-mono text-foreground">{aberto.numero_venda}</span>
                  </p>
                )}
                {aberto.numeros_os && aberto.numeros_os.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    OS:{" "}
                    {aberto.numeros_os.map((n) => (
                      <span key={n} className="ml-1 font-mono text-foreground">
                        {n}
                      </span>
                    ))}
                  </p>
                )}
                {(() => {
                  const confirmadoAt = (aberto.metadata as { cliente_confirmou_at?: string } | null)
                    ?.cliente_confirmou_at;
                  const horaPassou = new Date(aberto.data_horario).getTime() < Date.now();
                  const ativo = !["compareceu", "no_show", "cancelado", "venda_fechada"].includes(
                    aberto.status,
                  );
                  return (
                    <>
                      {aberto.status === "agendado" && !confirmadoAt && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Aguardando confirmação do cliente
                        </span>
                      )}
                      {confirmadoAt && horaPassou && ativo && (
                        <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                          Aguardando você confirmar comparecimento
                        </span>
                      )}
                      {ativo && (
                        <AcaoAgendamentoButtons
                          agendamentoId={aberto.id}
                          size="default"
                          onDone={() => {
                            void load();
                            setAberto(null);
                          }}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CardAgendamento({
  a,
  onOpen,
  mostrarData,
}: {
  a: Agendamento;
  onOpen: () => void;
  mostrarData?: boolean;
}) {
  const dt = new Date(a.data_horario);
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-stretch gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-soft transition-colors hover:bg-muted/40"
    >
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 px-1 py-1.5 text-primary">
        {mostrarData && (
          <span className="text-[10px] font-semibold uppercase">
            {format(dt, "dd/MM", { locale: ptBR })}
          </span>
        )}
        <span className="text-sm font-bold leading-tight">{format(dt, "HH:mm")}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {a.contato?.nome ?? "Cliente"}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              statusTone(a.status),
            )}
          >
            {STATUS_LABEL[a.status] ?? a.status}
          </span>
        </div>
        {(() => {
          const meta = a.metadata as { cliente_confirmou_at?: string } | null;
          const confirmadoAt = meta?.cliente_confirmou_at;
          const horaPassou = new Date(a.data_horario).getTime() < Date.now();
          const ativo = !["compareceu", "no_show", "cancelado", "venda_fechada"].includes(
            a.status,
          );
          if (a.status === "agendado" && !confirmadoAt) {
            return (
              <span className="mt-1 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Aguardando confirmação
              </span>
            );
          }
          if (confirmadoAt && horaPassou && ativo) {
            return (
              <span className="mt-1 inline-block rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                Aguardando confirmar comparecimento
              </span>
            );
          }
          return null;
        })()}
        {a.contato?.telefone && (
          <p className="truncate text-xs text-muted-foreground">
            {formatPhone(a.contato.telefone)}
          </p>
        )}
        {a.observacoes && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.observacoes}</p>
        )}
        {(a.valor_orcamento != null || a.valor_venda != null) && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            {a.valor_venda != null
              ? `Venda ${formatBRL(a.valor_venda)}`
              : `Orçamento ${formatBRL(a.valor_orcamento)}`}
          </p>
        )}
      </div>
    </button>
  );
}
