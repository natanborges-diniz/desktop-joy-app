import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  FileText,
  History,
  ImageIcon,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ComprovantePagamento = {
  url?: string | null;
  anexo_url?: string | null;
  mime?: string | null;
  anexo_mime?: string | null;
  nome_arquivo?: string | null;
  anexo_nome?: string | null;
  pago_em?: string | null;
  data?: string | null;
  valor_pago?: number | string | null;
  valor?: number | string | null;
  forma?: string | null;
  metodo?: string | null;
  nsu?: string | null;
  bandeira?: string | null;
  [k: string]: unknown;
};

type SolicitacaoMeta = {
  boleto_status?: string | null;
  boleto_revisao?: { ciclo?: number } | null;
  boleto_anexos_historico?: Array<{
    ciclo?: number;
    enviado_em?: string;
    anexos?: Array<{ url: string; nome?: string; mime?: string }>;
    motivo?: string;
  }> | null;
  comprovante_pagamento?: ComprovantePagamento | null;
  [k: string]: unknown;
};

type Solicitacao = {
  id: string;
  protocolo: string | null;
  assunto: string | null;
  status: string | null;
  created_at: string;
  pipeline_coluna_id: string | null;
  metadata: SolicitacaoMeta | null;
  pipeline_colunas?:
    | { nome: string | null; cor: string | null }
    | { nome: string | null; cor: string | null }[]
    | null;
};

type Comentario = {
  id: string;
  solicitacao_id: string;
  tipo: string | null;
  conteudo: string;
  autor_nome: string | null;
  autor_id: string | null;
  created_at: string;
  anexo_url?: string | null;
  anexo_nome?: string | null;
  anexo_mime?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MAX_CICLOS_FALLBACK = 3;

async function carregarMaxCiclos(): Promise<number> {
  try {
    const { data } = await supabase
      .from("app_config")
      .select("valor")
      .eq("chave", "boleto_max_ciclos_revisao")
      .maybeSingle();
    const v = (data as { valor?: unknown } | null)?.valor;
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string"
          ? parseInt(v, 10)
          : typeof v === "object" && v && "value" in (v as any)
            ? Number((v as any).value)
            : NaN;
    return Number.isFinite(n) && n > 0 ? n : MAX_CICLOS_FALLBACK;
  } catch {
    return MAX_CICLOS_FALLBACK;
  }
}

const SELECT_SOLICITACAO =
  "id, protocolo, assunto, status, created_at, pipeline_coluna_id, metadata, pipeline_colunas(nome,cor)";
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 50;
const STATUS_FINAIS = ["concluida", "cancelada"];

type Aba = "ativas" | "concluidas" | "todas";

const ABAS: { id: Aba; label: string }[] = [
  { id: "ativas", label: "Ativas" },
  { id: "concluidas", label: "Concluídas" },
  { id: "todas", label: "Todas" },
];

const TIPOS_FIXOS: { value: string; label: string }[] = [
  { value: "pix_pagamento", label: "Pix" },
  { value: "link_pagamento", label: "Link de Pagamento" },
  { value: "boleto", label: "Boleto" },
  { value: "consulta_cpf", label: "Consulta CPF" },
  { value: "confirmacao_pix", label: "Confirmação de Pix" },
  { value: "estorno_cartao", label: "Estorno Cartão" },
  { value: "estorno_pix_debito", label: "Estorno Pix/Débito" },
  { value: "reembolso", label: "Reembolso" },
  { value: "pagamento", label: "Pagamento" },
  { value: "devolucao_os", label: "Devolução de OS" },
];

function tipoLabel(tipo: string): string {
  const fixo = TIPOS_FIXOS.find((t) => t.value === tipo);
  if (fixo) return fixo.label;
  return tipo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sanitiza o termo de busca para o parser do PostgREST (vírgulas e parênteses
 * quebram a expressão `.or(...)`). Quando o usuário digita vírgula decimal
 * (ex.: "150,00"), gera também a variante com ponto ("150.00") para casar com
 * valores armazenados em formato numérico.
 */
function variantesBusca(raw: string): string[] {
  const limpar = (s: string) => s.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
  const variantes = new Set<string>();
  const base = limpar(raw);
  if (base) variantes.add(base);
  if (raw.includes(",")) {
    const comPonto = limpar(raw.replace(/,/g, "."));
    if (comPonto) variantes.add(comPonto);
  }
  return [...variantes];
}

const CAMPOS_BUSCA = [
  "protocolo",
  "assunto",
  "tipo",
  "metadata->>cliente",
  "metadata->>cliente_nome",
  "metadata->>valor",
];

function montarOrBusca(termo: string): string | null {
  const variantes = variantesBusca(termo);
  if (!variantes.length) return null;
  const partes: string[] = [];
  for (const v of variantes) {
    for (const campo of CAMPOS_BUSCA) partes.push(`${campo}.ilike.%${v}%`);
  }
  return partes.join(",");
}

export default function LojaMinhasDemandas() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const { podeMenuLoja, loading: ctxLoading } = useLojaContext();
  const { lojasFiltro, lojaSelecionada } = useFiltroLoja();

  const [items, setItems] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<Solicitacao | null>(null);
  const [maxCiclos, setMaxCiclos] = useState<number>(MAX_CICLOS_FALLBACK);

  // toolbar
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState(""); // termo debounced (>= 2 chars) — modo busca no servidor
  const [aba, setAba] = useState<Aba>("ativas");
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<{ ativas: number | null; concluidas: number | null }>({
    ativas: null,
    concluidas: null,
  });

  const searchMode = busca.length >= 2;

  const lojaOr = useMemo(
    () =>
      lojasFiltro
        .map((l) => {
          const safe = l.replace(/,/g, "\\,");
          return `metadata->>alias_loja.eq.${safe},metadata->>loja_nome.eq.${safe}`;
        })
        .join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lojasFiltro.join("|")],
  );

  async function load() {
    if (!lojasFiltro.length) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase.from("solicitacoes").select(SELECT_SOLICITACAO).or(lojaOr);
    if (aba === "ativas") {
      query = query.not("status", "in", `(${STATUS_FINAIS.join(",")})`);
    } else if (aba === "concluidas") {
      query = query.eq("status", "concluida");
    }
    if (searchMode) {
      const orBusca = montarOrBusca(busca);
      // múltiplos .or() no supabase-js são combinados com AND (comportamento desejado)
      if (orBusca) query = query.or(orBusca);
    }
    const limite = searchMode ? SEARCH_LIMIT : pages * PAGE_SIZE;
    const { data } = await query
      .order("created_at", { ascending: false })
      .range(0, limite - 1);
    const lista = (data ?? []) as Solicitacao[];
    setItems(lista);
    setHasMore(!searchMode && lista.length === limite);
    setLoading(false);
  }

  async function loadCounts() {
    if (!lojasFiltro.length) {
      setCounts({ ativas: null, concluidas: null });
      return;
    }
    const [ativas, concluidas] = await Promise.all([
      supabase
        .from("solicitacoes")
        .select("id", { count: "exact", head: true })
        .or(lojaOr)
        .not("status", "in", `(${STATUS_FINAIS.join(",")})`),
      supabase
        .from("solicitacoes")
        .select("id", { count: "exact", head: true })
        .or(lojaOr)
        .eq("status", "concluida"),
    ]);
    setCounts({ ativas: ativas.count ?? null, concluidas: concluidas.count ?? null });
  }

  // refs para o canal realtime reutilizar o fetch vigente (aba/busca atuais)
  const loadRef = useRef(load);
  const loadCountsRef = useRef(loadCounts);
  useEffect(() => {
    loadRef.current = load;
    loadCountsRef.current = loadCounts;
  });

  // debounce da busca (~350ms)
  useEffect(() => {
    const t = setTimeout(() => {
      const v = buscaInput.trim();
      setBusca(v.length >= 2 ? v : "");
      setPages(1);
    }, 350);
    return () => clearTimeout(t);
  }, [buscaInput]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaOr, aba, busca, pages]);

  useEffect(() => {
    void loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaOr]);

  useEffect(() => {
    void carregarMaxCiclos().then(setMaxCiclos);
  }, []);

  // Abre automaticamente a solicitação vinda por deep-link (?solicitacao=:id),
  // tipicamente quando o usuário toca/clica em uma notificação. Se o item não
  // estiver na página carregada, busca diretamente por id.
  const deepLinkBuscadoRef = useRef<string | null>(null);
  useEffect(() => {
    const solId = searchParams.get("solicitacao");
    if (!solId || loading) return;
    const limparParam = () => {
      // limpa o query param para que recarregar a página não force o reabrir
      const next = new URLSearchParams(searchParams);
      next.delete("solicitacao");
      setSearchParams(next, { replace: true });
    };
    const alvo = items.find((s) => s.id === solId);
    if (alvo) {
      setAberta(alvo);
      limparParam();
      return;
    }
    if (deepLinkBuscadoRef.current === solId) return;
    deepLinkBuscadoRef.current = solId;
    void (async () => {
      const { data } = await supabase
        .from("solicitacoes")
        .select(SELECT_SOLICITACAO)
        .eq("id", solId)
        .maybeSingle();
      if (data) setAberta(data as unknown as Solicitacao);
      limparParam();
    })();
  }, [searchParams, items, loading, setSearchParams]);

  // mantém a SOL aberta sincronizada com a lista (metadata atualiza após revisão)
  useEffect(() => {
    if (!aberta) return;
    const atual = items.find((s) => s.id === aberta.id);
    if (atual && atual !== aberta) setAberta(atual);
  }, [items, aberta]);

  // realtime na lista — re-executa o fetch atual (respeitando aba/busca vigentes)
  useEffect(() => {
    if (!lojasFiltro.length) return;
    const ch = supabase
      .channel(`lista-sol-${lojaSelecionada ?? "todas"}-${lojasFiltro.length}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitacoes" },
        () => {
          void loadRef.current();
          void loadCountsRef.current();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojasFiltro.join("|")]);

  // opções do select de tipo: lista fixa + tipos presentes nos itens carregados
  const tiposDisponiveis = useMemo(() => {
    const conhecidos = new Set(TIPOS_FIXOS.map((t) => t.value));
    const extras: string[] = [];
    for (const s of items) {
      const t = (s.metadata as Record<string, unknown> | null)?.tipo;
      if (typeof t === "string" && t && !conhecidos.has(t) && !extras.includes(t)) {
        extras.push(t);
      }
    }
    return [...TIPOS_FIXOS, ...extras.sort().map((t) => ({ value: t, label: tipoLabel(t) }))];
  }, [items]);

  // filtro de tipo é client-side
  const visiveis = useMemo(() => {
    if (tipoFiltro === "todos") return items;
    return items.filter(
      (s) => ((s.metadata as Record<string, unknown> | null)?.tipo ?? null) === tipoFiltro,
    );
  }, [items, tipoFiltro]);

  function trocarAba(nova: Aba) {
    setAba(nova);
    setPages(1);
  }

  const anoAtual = new Date().getFullYear();

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Minhas Demandas</h1>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => navigate("/nova-demanda")}
          >
            <MessageSquarePlus className="h-4 w-4" /> Nova
          </Button>
        </div>
        <p className="pb-3 text-sm text-white/80">
          {lojaSelecionada ? `Loja: ${lojaSelecionada}` : lojasFiltro.length > 1 ? `Todas as lojas (${lojasFiltro.length})` : "—"}
        </p>
      </header>

      {!ctxLoading && podeMenuLoja && (
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                inputMode="search"
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                placeholder="Buscar por protocolo, cliente, valor..."
                aria-label="Buscar demandas por protocolo, cliente ou valor"
                className="h-9 pl-8 pr-8 text-sm"
              />
              {buscaInput && (
                <button
                  type="button"
                  onClick={() => setBuscaInput("")}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger
                className="h-9 w-[118px] shrink-0 text-xs"
                aria-label="Filtrar por tipo de demanda"
              >
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {tiposDisponiveis.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            role="tablist"
            aria-label="Filtrar por status"
            className="mx-auto mt-2 flex max-w-3xl gap-1.5 overflow-x-auto scroll-thin"
          >
            {ABAS.map((a) => {
              const ativa = aba === a.id;
              const contador =
                a.id === "ativas"
                  ? counts.ativas
                  : a.id === "concluidas"
                    ? counts.concluidas
                    : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => trocarAba(a.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    ativa
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {a.label}
                  {contador != null ? ` (${contador})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {ctxLoading || (loading && items.length === 0) ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !podeMenuLoja ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Apenas lojas/colaboradores acessam esta área.
          </p>
        ) : visiveis.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-3 text-center">
            {searchMode ? (
              <p className="text-sm text-muted-foreground">
                Nada encontrado para "{busca}".
              </p>
            ) : items.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Nenhuma demanda do tipo selecionado.
                </p>
                <Button variant="outline" size="sm" onClick={() => setTipoFiltro("todos")}>
                  Limpar filtro de tipo
                </Button>
              </>
            ) : aba === "concluidas" ? (
              <p className="text-sm text-muted-foreground">Nenhuma demanda concluída ainda.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Nenhuma demanda ainda — toque em Nova para abrir a primeira.
                </p>
                <Button onClick={() => navigate("/nova-demanda")}>Abrir nova demanda</Button>
              </>
            )}
          </div>
        ) : (
          <>
            <ul
              className={`mx-auto grid max-w-3xl gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}
            >
              {visiveis.map((s) => {
                const m = (s.metadata ?? {}) as Record<string, any>;
                const cliente: string | null =
                  m.cliente_nome ?? m.cliente ?? m.nome_cliente ?? m.dados?.cliente ?? null;
                const valorRaw = m.valor_total ?? m.dados?.valor_total ?? m.valor ?? null;
                const valorNum =
                  typeof valorRaw === "number"
                    ? valorRaw
                    : typeof valorRaw === "string" && valorRaw
                      ? Number(valorRaw.replace(",", "."))
                      : null;
                const valorFmt =
                  valorNum != null && Number.isFinite(valorNum)
                    ? valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : null;
                const parcelas = m.qtd_parcelas ?? m.dados?.qtd_parcelas ?? null;
                const tipo: string | null = typeof m.tipo === "string" ? m.tipo : null;
                const lojaLbl: string | null = m.alias_loja ?? m.loja_nome ?? null;
                const temComprovante = !!(
                  m.comprovante_pagamento &&
                  (m.comprovante_pagamento.url || m.comprovante_pagamento.anexo_url)
                );
                const statusFinal = s.status && STATUS_FINAIS.includes(s.status);
                const dt = new Date(s.created_at);
                const dataCurta = format(
                  dt,
                  dt.getFullYear() === anoAtual ? "d MMM" : "d MMM yy",
                  { locale: ptBR },
                );
                const col = Array.isArray(s.pipeline_colunas)
                  ? s.pipeline_colunas[0]
                  : s.pipeline_colunas;
                return (
                  <li key={s.id}>
                    <Card
                      className="cursor-pointer p-4 shadow-soft transition-shadow hover:shadow-elevated"
                      onClick={() => setAberta(s)}
                    >
                      {/* linha 1: protocolo + tipo (+ loja) + data curta */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                            {s.protocolo ?? "—"}
                          </span>
                          {tipo && (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                              {tipoLabel(tipo)}
                            </span>
                          )}
                          {lojaLbl && lojasFiltro.length > 1 && (
                            <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {lojaLbl}
                            </span>
                          )}
                        </div>
                        <time
                          dateTime={s.created_at}
                          title={format(dt, "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          className="shrink-0 text-[11px] text-muted-foreground"
                        >
                          {dataCurta}
                        </time>
                      </div>

                      {/* linha 2: título forte */}
                      <h2 className="mt-1.5 truncate font-semibold text-foreground">
                        {cliente ?? s.assunto ?? "Sem assunto"}
                      </h2>
                      {cliente && s.assunto && (
                        <p className="truncate text-xs text-muted-foreground">{s.assunto}</p>
                      )}

                      {/* linha 3: valor + estado do pipeline + status/pago */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {valorFmt && (
                          <span className="text-sm font-bold text-foreground">
                            {valorFmt}
                            {parcelas ? (
                              <span className="font-normal text-muted-foreground"> · {parcelas}x</span>
                            ) : null}
                          </span>
                        )}
                        {col?.nome && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span
                              aria-hidden="true"
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: col.cor ?? "#94a3b8" }}
                            />
                            {col.nome}
                          </span>
                        )}
                        {temComprovante && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <BadgeCheck className="h-3 w-3" /> Pago
                          </span>
                        )}
                        {statusFinal && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                              s.status === "concluida"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {s.status === "concluida" ? "Concluída" : "Cancelada"}
                          </span>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
            {!searchMode && hasMore && (
              <div className="mx-auto mt-4 flex max-w-3xl justify-center pb-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => setPages((p) => p + 1)}
                  className="gap-1.5"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Carregar mais
                </Button>
              </div>
            )}
            {searchMode && visiveis.length >= SEARCH_LIMIT && (
              <p className="mx-auto mt-3 max-w-3xl text-center text-[11px] text-muted-foreground">
                Mostrando os primeiros {SEARCH_LIMIT} resultados — refine a busca para ver mais.
              </p>
            )}
          </>
        )}
      </div>

      <Sheet open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {aberta && (
            <DetalheSolicitacao
              solicitacao={aberta}
              user={user}
              profileNome={profile?.nome ?? "Loja"}
              maxCiclos={maxCiclos}
              onClose={() => setAberta(null)}
              onRefresh={() => void load()}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetalheSolicitacao({
  solicitacao,
  user,
  profileNome,
  maxCiclos,
  onClose,
  onRefresh,
}: {
  solicitacao: Solicitacao;
  user: { id: string } | null;
  profileNome: string;
  maxCiclos: number;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [coments, setComents] = useState<Comentario[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [revisaoOpen, setRevisaoOpen] = useState(false);

  const meta = (solicitacao.metadata ?? {}) as SolicitacaoMeta;
  const boletoStatus = meta.boleto_status ?? null;
  const cicloAtual = Number(meta.boleto_revisao?.ciclo ?? 0);
  const historico = Array.isArray(meta.boleto_anexos_historico)
    ? meta.boleto_anexos_historico!
    : [];
  const podeSolicitarRevisao =
    boletoStatus === "enviado" && cicloAtual < maxCiclos;

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("solicitacao_comentarios")
      .select(
        "id, solicitacao_id, autor_id, autor_nome, conteudo, tipo, created_at, anexo_url, anexo_nome, anexo_mime, metadata",
      )
      .eq("solicitacao_id", solicitacao.id)
      .order("created_at");
    setComents((data ?? []) as Comentario[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`sol-${solicitacao.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "solicitacao_comentarios",
          filter: `solicitacao_id=eq.${solicitacao.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacao.id]);

  async function enviar() {
    if (!texto.trim() || !user) return;
    setEnviando(true);
    const { error } = await supabase.functions.invoke("comentar-solicitacao", {
      body: {
        solicitacao_id: solicitacao.id,
        conteudo: texto.trim(),
        destino: "setor",
      },
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível enviar ao setor");
      return;
    }
    setTexto("");
    void load();
  }

  return (
    <>
      <SheetHeader className="border-b border-border bg-gradient-header px-4 py-3 text-header-foreground">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1 hover:bg-white/15"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <SheetTitle className="text-base text-header-foreground">
            {solicitacao.protocolo ?? "Solicitação"}
          </SheetTitle>
        </div>
        <p className="ml-7 truncate text-xs text-white/80">{solicitacao.assunto ?? "—"}</p>
      </SheetHeader>

      <div className="flex-1 space-y-3 overflow-y-auto scroll-thin bg-surface-muted p-3">
        {meta.comprovante_pagamento && (
          <ComprovantePagamentoCard comp={meta.comprovante_pagamento} />
        )}

        {boletoStatus === "enviado" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Boleto enviado</p>
                <p className="text-muted-foreground">
                  Ciclo {cicloAtual}/{maxCiclos} de revisões usado.
                </p>
              </div>
              {podeSolicitarRevisao ? (
                <Button size="sm" variant="outline" onClick={() => setRevisaoOpen(true)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Solicitar revisão
                </Button>
              ) : (
                <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  Limite atingido
                </span>
              )}
            </div>
          </div>
        )}

        {historico.length > 0 && (
          <HistoricoBoletos historico={historico} />
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (() => {
          const visiveis = coments.filter(
            (c) => c.tipo === "retorno_setor" || c.tipo === "resposta_loja",
          );
          if (visiveis.length === 0) {
            return (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Sem mensagens do setor ainda.
              </p>
            );
          }
          return visiveis.map((c) => {
            const daLoja = c.tipo === "resposta_loja";
            return (
              <div
                key={c.id}
                className={`flex ${daLoja ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${
                    daLoja
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground border border-border"
                  }`}
                >
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        daLoja
                          ? "bg-success/20 text-success-foreground"
                          : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {daLoja ? "Você" : "Setor"}
                    </span>
                    <span className="text-[11px] font-semibold opacity-80">
                      {c.autor_nome ?? (daLoja ? "Loja" : "Operador")}
                    </span>
                  </div>
                  {c.conteudo && <p className="whitespace-pre-wrap">{c.conteudo}</p>}
                  {c.anexo_url && <AnexoCard url={c.anexo_url} nome={c.anexo_nome} mime={c.anexo_mime} meu={daLoja} />}
                  <p className="mt-1 text-[10px] opacity-70">
                    {format(new Date(c.created_at), "d MMM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Escreva uma resposta ao setor..."
            className="min-h-[44px] resize-none"
          />
          <Button onClick={enviar} disabled={enviando || !texto.trim()} className="gap-1.5">
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                Responder ao setor
              </>
            )}
          </Button>
        </div>
      </div>

      <SolicitarRevisaoDialog
        open={revisaoOpen}
        onOpenChange={setRevisaoOpen}
        solicitacaoId={solicitacao.id}
        maxCiclos={maxCiclos}
        onSuccess={() => {
          setRevisaoOpen(false);
          onRefresh();
        }}
      />
    </>
  );
}

function HistoricoBoletos({
  historico,
}: {
  historico: NonNullable<SolicitacaoMeta["boleto_anexos_historico"]>;
}) {
  const ordenado = useMemo(
    () => [...historico].sort((a, b) => (b.ciclo ?? 0) - (a.ciclo ?? 0)),
    [historico],
  );
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs">
      <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
        <History className="h-3.5 w-3.5" />
        Versões anteriores ({ordenado.length})
      </p>
      <ul className="space-y-2">
        {ordenado.map((h, idx) => (
          <li key={idx} className="rounded border border-border/60 bg-muted/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Ciclo {h.ciclo ?? idx + 1}</span>
              {h.enviado_em && (
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(h.enviado_em), "d MMM HH:mm", { locale: ptBR })}
                </span>
              )}
            </div>
            {h.motivo && (
              <p className="mt-1 italic text-muted-foreground">Motivo: {h.motivo}</p>
            )}
            {Array.isArray(h.anexos) && h.anexos.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {h.anexos.map((a, i) => (
                  <li key={i}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      <FileText className="h-3 w-3" />
                      {a.nome ?? `Anexo ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CAMPOS_REVISAO = [
  { id: "valor", label: "Valor" },
  { id: "parcelas", label: "Parcelas" },
  { id: "vencimento", label: "Vencimento" },
  { id: "dados_cliente", label: "Dados do cliente" },
] as const;

function SolicitarRevisaoDialog({
  open,
  onOpenChange,
  solicitacaoId,
  maxCiclos,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  solicitacaoId: string;
  maxCiclos: number;
  onSuccess: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [campos, setCampos] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) {
      setMotivo("");
      setCampos({});
      setEnviando(false);
    }
  }, [open]);

  const motivoValido = motivo.trim().length >= 5;

  async function submeter() {
    if (!motivoValido) {
      toast.error("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }
    setEnviando(true);
    const campos_revisar = Object.entries(campos)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const { data, error } = await supabase.functions.invoke("solicitar-revisao-boleto", {
      body: {
        solicitacao_id: solicitacaoId,
        motivo: motivo.trim(),
        campos_revisar,
      },
    });
    setEnviando(false);
    if (error) {
      const msg = (error as any)?.message ?? "";
      const body = (data as any) ?? {};
      const code = body?.error ?? body?.code ?? "";
      if (code === "boleto_ainda_nao_enviado" || /ainda_nao_enviado/i.test(msg)) {
        toast.error("O boleto ainda não foi enviado pelo Financeiro.");
      } else if (code === "limite_de_ciclos_atingido" || /limite/i.test(msg)) {
        toast.error(`Limite de ${maxCiclos} revisões atingido — abra novo pedido.`);
      } else {
        toast.error(msg || "Não foi possível solicitar a revisão.");
      }
      return;
    }
    toast.success("Revisão solicitada. O Financeiro foi notificado.");
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar revisão do boleto</DialogTitle>
          <DialogDescription>
            Descreva o que precisa ser ajustado. O Financeiro vai gerar uma nova versão.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="motivo-revisao">Motivo</Label>
            <Textarea
              id="motivo-revisao"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Ex.: valor da parcela divergente do contrato"
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Mínimo 5 caracteres. ({motivo.trim().length})
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">O que revisar? (opcional)</p>
            <div className="grid grid-cols-2 gap-2">
              {CAMPOS_REVISAO.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded border border-border bg-muted/30 px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={!!campos[c.id]}
                    onCheckedChange={(v) =>
                      setCampos((s) => ({ ...s, [c.id]: v === true }))
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={enviando || !motivoValido}>
            {enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnexoCard({
  url,
  nome,
  mime,
  meu,
}: {
  url: string;
  nome?: string | null;
  mime?: string | null;
  meu: boolean;
}) {
  const isImage = (mime ?? "").startsWith("image/");
  const displayName = nome ?? (isImage ? "Imagem" : "Anexo");

  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        className="mt-2 block overflow-hidden rounded-lg border border-border/50"
      >
        <img src={url} alt={displayName} className="max-h-64 w-full object-cover" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      className={`mt-2 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
        meu
          ? "border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/15"
          : "border-border bg-muted/50 hover:bg-muted"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          meu ? "bg-primary-foreground/15" : "bg-background"
        }`}
      >
        {(mime ?? "").includes("pdf") ? (
          <FileText className="h-4 w-4" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{displayName}</span>
        <span className="block truncate opacity-70">Toque para abrir</span>
      </span>
    </button>
  );
}

function ComprovantePagamentoCard({ comp }: { comp: ComprovantePagamento }) {
  const url = (comp.url ?? comp.anexo_url ?? null) as string | null;
  const mime = (comp.mime ?? comp.anexo_mime ?? null) as string | null;
  const nome = (comp.nome_arquivo ?? comp.anexo_nome ?? null) as string | null;
  const pagoEm = (comp.pago_em ?? comp.data ?? null) as string | null;
  const valorRaw = comp.valor_pago ?? comp.valor ?? null;
  const valorNum =
    typeof valorRaw === "number"
      ? valorRaw
      : typeof valorRaw === "string" && valorRaw
        ? Number(String(valorRaw).replace(",", "."))
        : null;
  const valorFmt =
    valorNum != null && Number.isFinite(valorNum)
      ? valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : null;
  const forma = (comp.forma ?? comp.metodo ?? null) as string | null;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
      <div className="mb-2 flex items-center gap-1.5">
        <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <p className="font-semibold text-foreground">Pagamento recebido</p>
      </div>
      <dl className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {valorFmt && (
          <>
            <dt>Valor</dt>
            <dd className="text-right font-medium text-foreground">{valorFmt}</dd>
          </>
        )}
        {forma && (
          <>
            <dt>Forma</dt>
            <dd className="text-right font-medium text-foreground uppercase">{forma}</dd>
          </>
        )}
        {pagoEm && (
          <>
            <dt>Pago em</dt>
            <dd className="text-right font-medium text-foreground">
              {format(new Date(pagoEm), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
            </dd>
          </>
        )}
        {comp.nsu && (
          <>
            <dt>NSU</dt>
            <dd className="text-right font-medium text-foreground">{String(comp.nsu)}</dd>
          </>
        )}
        {comp.bandeira && (
          <>
            <dt>Bandeira</dt>
            <dd className="text-right font-medium text-foreground">{String(comp.bandeira)}</dd>
          </>
        )}
      </dl>
      {url && <AnexoCard url={url} nome={nome} mime={mime} meu={false} />}
    </div>
  );
}

