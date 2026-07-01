import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  History,
  ImageIcon,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Send,
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

type SolicitacaoMeta = {
  boleto_status?: string | null;
  boleto_revisao?: { ciclo?: number } | null;
  boleto_anexos_historico?: Array<{
    ciclo?: number;
    enviado_em?: string;
    anexos?: Array<{ url: string; nome?: string; mime?: string }>;
    motivo?: string;
  }> | null;
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


  async function load() {
    if (!lojasFiltro.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const orExpr = lojasFiltro
      .map((l) => {
        const safe = l.replace(/,/g, "\\,");
        return `metadata->>alias_loja.eq.${safe},metadata->>loja_nome.eq.${safe}`;
      })
      .join(",");
    const { data } = await supabase
      .from("solicitacoes")
      .select(
        "id, protocolo, assunto, status, created_at, pipeline_coluna_id, metadata, pipeline_colunas(nome,cor)",
      )
      .or(orExpr)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Solicitacao[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojasFiltro.join("|")]);

  useEffect(() => {
    void carregarMaxCiclos().then(setMaxCiclos);
  }, []);

  // Abre automaticamente a solicitação vinda por deep-link (?solicitacao=:id),
  // tipicamente quando o usuário toca/clica em uma notificação.
  useEffect(() => {
    const solId = searchParams.get("solicitacao");
    if (!solId || loading) return;
    const alvo = items.find((s) => s.id === solId);
    if (alvo) {
      setAberta(alvo);
      // limpa o query param para que recarregar a página não force o reabrir
      const next = new URLSearchParams(searchParams);
      next.delete("solicitacao");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, items, loading, setSearchParams]);


  // mantém a SOL aberta sincronizada com a lista (metadata atualiza após revisão)
  useEffect(() => {
    if (!aberta) return;
    const atual = items.find((s) => s.id === aberta.id);
    if (atual && atual !== aberta) setAberta(atual);
  }, [items, aberta]);

  // realtime na lista
  useEffect(() => {
    if (!lojasFiltro.length) return;
    const ch = supabase
      .channel(`lista-sol-${lojaSelecionada ?? "todas"}-${lojasFiltro.length}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "solicitacoes" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojasFiltro.join("|")]);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Minhas demandas</h1>
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

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {ctxLoading || loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !podeMenuLoja ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Apenas lojas/colaboradores acessam esta área.
          </p>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Você ainda não abriu nenhuma demanda.
            </p>
            <Button onClick={() => navigate("/nova-demanda")}>Abrir nova demanda</Button>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-3xl gap-3">
            {items.map((s) => (
              <li key={s.id}>
                <Card
                  className="cursor-pointer p-4 shadow-soft transition-shadow hover:shadow-elevated"
                  onClick={() => setAberta(s)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                        {s.protocolo ?? "—"}
                      </span>
                      <h2 className="mt-1 truncate font-semibold text-foreground">
                        {s.assunto ?? "Sem assunto"}
                      </h2>
                      {(() => {
                        const col = Array.isArray(s.pipeline_colunas)
                          ? s.pipeline_colunas[0]
                          : s.pipeline_colunas;
                        if (!col?.nome) return null;
                        return (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: col.cor ?? "#94a3b8" }}
                            />
                            {col.nome}
                          </p>
                        );
                      })()}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {s.status ?? "—"}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {format(new Date(s.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
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
    const { error } = await supabase.from("solicitacao_comentarios").insert({
      solicitacao_id: solicitacao.id,
      tipo: "interno",
      conteudo: texto.trim(),
      autor_id: user.id,
      autor_nome: profileNome,
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível enviar");
      return;
    }
    setTexto("");
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
        ) : coments.length === 0 ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Sem comentários ainda.
          </p>
        ) : (
          coments.map((c) => {
            const meu = c.autor_id === user?.id;
            return (
              <div
                key={c.id}
                className={`flex ${meu ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-soft ${
                    meu
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground"
                  }`}
                >
                  {!meu && (
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">
                      {c.autor_nome ?? "Operador"}
                    </p>
                  )}
                  {c.conteudo && <p className="whitespace-pre-wrap">{c.conteudo}</p>}
                  {c.anexo_url && <AnexoCard url={c.anexo_url} nome={c.anexo_nome} mime={c.anexo_mime} meu={meu} />}
                  <p className="mt-1 text-[10px] opacity-70">
                    {format(new Date(c.created_at), "d MMM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Escreva um comentário..."
            className="min-h-[44px] resize-none"
          />
          <Button onClick={enviar} disabled={enviando || !texto.trim()} size="icon">
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
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
