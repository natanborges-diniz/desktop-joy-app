import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  PackageCheck,
  CheckCircle2,
  Search,
  AlertTriangle,
  Clock3,
  Check,
  Eye,
  CalendarCheck,
  XCircle,
  Send,
  RefreshCw,
  Phone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizarNomeLoja } from "@/lib/cashbackLoja";

type ProdutoItem = { tipo?: string | null; descricao?: string | null };
type Preview = {
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  loja_nome_os?: string | null;
  cod_empresa?: string | null;
  cod_etapa_atual?: string | number | null;
  etapa_label?: string | null;
  produtos?: ProdutoItem[] | null;
};
type PreviewResponse = {
  preview?: Preview | null;
  loja_confere?: boolean | null;
  ja_recebida?: { recebido_at?: string | null; loja?: string | null } | null;
  error?: string | null;
};


type WaStatus = "sent" | "delivered" | "read" | "failed" | "no_dispatch" | null;

type HistoricoRow = {
  id: string;
  os_numero: string | null;
  cliente_nome: string | null;
  loja_nome: string | null;
  recebido_at: string | null;
  notificado_cliente_at: string | null;
  wa_status: WaStatus;
  wa_status_at: string | null;
  wa_status_reason: string | null;
  agendamento_id: string | null;
};

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  return `há ${dias} d`;
}


function BuscarOS() {
  const { lojaNome } = useLojaContext();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const lojaAtiva = lojaSelecionada ?? lojaNome ?? null;
  const [osNumero, setOsNumero] = useState("");
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [lastQuery, setLastQuery] = useState<string>("");

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    const numero = osNumero.trim();
    if (!numero) return;
    if (lojasDoUsuario.length > 1 && !lojaSelecionada) {
      toast.error("Selecione uma loja no filtro acima antes de buscar a OS.");
      return;
    }
    setSearching(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("confirmar-recebimento-os", {
        body: { action: "preview", os_numero: numero, loja_nome: lojaAtiva },
      });
      if (error) throw error;
      const resp = (data ?? {}) as PreviewResponse;
      if (resp.error) throw new Error(resp.error);
      // Se a OS for de outra loja e o usuário tem multiplas lojas → bloquear
      const lojaDaOS = resp.preview?.loja_nome_os ?? null;
      if (
        lojaAtiva &&
        lojaDaOS &&
        lojaDaOS !== lojaAtiva &&
        !lojasDoUsuario.includes(lojaDaOS)
      ) {
        toast.error(`Esta OS pertence a ${lojaDaOS}, troque o filtro`);
      } else if (lojaAtiva && lojaDaOS && lojaDaOS !== lojaAtiva) {
        toast.warning(`Esta OS pertence a ${lojaDaOS}, troque o filtro`);
      }
      setResult(resp);
      setLastQuery(numero);
    } catch (err: any) {
      toast.error("Falha ao buscar OS", { description: err?.message ?? "Tente novamente." });
    } finally {
      setSearching(false);
    }
  }

  async function confirmar() {
    const preview = result?.preview;
    if (!preview) return;
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirmar-recebimento-os", {
        body: { os_numero: lastQuery, loja_nome: preview.loja_nome_os },
      });
      if (error) throw error;
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error(String((data as any).error));
      }
      toast.success(`OS ${lastQuery} confirmada`, {
        description: "Cliente será notificado por WhatsApp.",
      });
      setOsNumero("");
      setResult(null);
      setLastQuery("");
    } catch (err: any) {
      toast.error("Falha ao confirmar recebimento", {
        description: err?.message ?? "Tente novamente em instantes.",
      });
    } finally {
      setConfirming(false);
    }
  }

  const preview = result?.preview ?? null;
  const lojaConfere = result?.loja_confere;
  const jaRecebida = result?.ja_recebida ?? null;

  return (
    <div className="space-y-4">
      <form onSubmit={buscar} className="flex gap-2">
        <Input
          inputMode="numeric"
          placeholder="Digite o número da OS"
          value={osNumero}
          onChange={(e) => setOsNumero(e.target.value)}
          disabled={searching || confirming}
          autoFocus
        />
        <Button type="submit" disabled={searching || confirming || !osNumero.trim()}>
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Search className="h-4 w-4" /> Buscar
            </>
          )}
        </Button>
      </form>

      {result && !preview && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          OS não encontrada.
        </div>
      )}

      {preview && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">OS {lastQuery}</CardTitle>
              {preview.loja_nome_os && (
                <Badge variant={lojaConfere === false ? "destructive" : "secondary"} className="shrink-0">
                  {preview.loja_nome_os}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {jaRecebida && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="font-medium text-foreground">OS já recebida</div>
                  <div className="text-muted-foreground">
                    Em {formatDateTime(jaRecebida.recebido_at)}
                    {jaRecebida.loja ? ` por ${jaRecebida.loja}` : ""}.
                  </div>
                </div>
              </div>
            )}

            {lojaConfere === false && !jaRecebida && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <div className="font-medium text-foreground">Loja diferente</div>
                  <div className="text-muted-foreground">
                    Esta OS pertence a <strong>{preview.loja_nome_os}</strong>, não à sua loja
                    {lojaNome ? ` (${lojaNome})` : ""}.
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-1.5 text-sm">
              <div>
                <span className="text-muted-foreground">Cliente: </span>
                <span className="font-medium text-foreground">{preview.cliente_nome ?? "—"}</span>
              </div>
              {preview.cliente_telefone && (
                <div>
                  <span className="text-muted-foreground">Telefone: </span>
                  <span className="text-foreground">{preview.cliente_telefone}</span>
                </div>
              )}
              {preview.etapa_label && (
                <div>
                  <span className="text-muted-foreground">Etapa atual: </span>
                  <span className="text-foreground">
                    {preview.etapa_label}
                    {preview.cod_etapa_atual != null ? ` (${preview.cod_etapa_atual})` : ""}
                  </span>
                </div>
              )}
              {preview.cod_empresa && (
                <div>
                  <span className="text-muted-foreground">Empresa: </span>
                  <span className="text-foreground">{preview.cod_empresa}</span>
                </div>
              )}
            </div>

            {Array.isArray(preview.produtos) && preview.produtos.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Produtos
                </div>
                <ul className="space-y-1">
                  {preview.produtos.map((p, i) => (
                    <li key={i} className="text-foreground">
                      {p.tipo ? <span className="text-muted-foreground">[{p.tipo}] </span> : null}
                      {p.descricao ?? "—"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              onClick={confirmar}
              disabled={confirming || !!jaRecebida}
              className="w-full"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Confirmando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Confirmar recebimento
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const WA_BADGE: Record<
  Exclude<WaStatus, null>,
  { label: string; className: string }
> = {
  sent: { label: "Enviado", className: "bg-slate-500 text-white hover:bg-slate-500" },
  delivered: { label: "Entregue", className: "bg-blue-500 text-white hover:bg-blue-500" },
  read: { label: "Lido", className: "bg-emerald-500 text-white hover:bg-emerald-500" },
  failed: { label: "Falhou", className: "bg-red-500 text-white hover:bg-red-500" },
  no_dispatch: { label: "Não enviado", className: "bg-red-500 text-white hover:bg-red-500" },
};

function TrackLine({
  icon: Icon,
  label,
  ts,
  active,
  tone = "muted",
}: {
  icon: typeof Clock3;
  label: string;
  ts?: string | null;
  active: boolean;
  tone?: "muted" | "slate" | "blue" | "emerald";
}) {
  const toneClass = !active
    ? "text-muted-foreground/50"
    : tone === "emerald"
      ? "text-emerald-600"
      : tone === "blue"
        ? "text-blue-600"
        : tone === "slate"
          ? "text-slate-600"
          : "text-foreground";
  return (
    <div className={cn("flex items-center gap-2 text-sm", toneClass)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{label}</span>
      {active && ts && <span className="text-xs text-muted-foreground">· {formatDateTime(ts)}</span>}
    </div>
  );
}

function formatarTelefoneBR(input: string) {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function telefoneValido(input: string) {
  const d = input.replace(/\D/g, "");
  return d.length === 10 || d.length === 11;
}

function HistoricoCard({ row, onChanged }: { row: HistoricoRow; onChanged: () => void }) {
  const [resending, setResending] = useState(false);
  const [editando, setEditando] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const status = row.wa_status;
  const badge = status ? WA_BADGE[status] : null;
  const agendou = !!row.agendamento_id;
  const falhou = status === "failed" || status === "no_dispatch";
  const semTelefone =
    status === "no_dispatch" &&
    /telefone|phone|sem\s+contato|sem\s+n[úu]mero|no_phone|missing_phone/i.test(
      row.wa_status_reason ?? "",
    );
  const sentTs = row.notificado_cliente_at ?? (status === "sent" ? row.wa_status_at : null);
  const deliveredTs = status === "delivered" || status === "read" ? row.wa_status_at : null;
  const readTs = status === "read" ? row.wa_status_at : null;

  async function reenviar() {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirmar-recebimento-os", {
        body: { action: "resend", os_numero: row.os_numero, loja_nome: row.loja_nome },
      });
      if (error) throw error;
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error(String((data as any).error));
      }
      toast.success("Aviso reenviado ao cliente.");
      onChanged();
    } catch (err: any) {
      toast.error("Falha ao reenviar aviso", { description: err?.message ?? "Tente novamente." });
    } finally {
      setResending(false);
    }
  }

  async function salvarTelefone() {
    const digits = telefone.replace(/\D/g, "");
    if (!telefoneValido(digits)) {
      toast.error("Telefone inválido", { description: "Use DDD + número (10 ou 11 dígitos)." });
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await supabase.functions.invoke("atualizar-telefone-cliente", {
        body: {
          os_numero: row.os_numero,
          loja_nome: row.loja_nome,
          telefone: digits,
          reenviar: true,
        },
      });
      if (error) throw error;
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error(String((data as any).error));
      }
      toast.success("Telefone atualizado", { description: "Aviso reenviado ao cliente." });
      setEditando(false);
      setTelefone("");
      onChanged();
    } catch (err: any) {
      toast.error("Falha ao atualizar telefone", {
        description: err?.message ?? "Tente novamente.",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">
              OS {row.os_numero ?? "—"}
              {row.cliente_nome ? <span className="text-muted-foreground"> · {row.cliente_nome}</span> : null}
            </CardTitle>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {row.loja_nome ? <>{row.loja_nome} · </> : null}
              {timeAgo(row.recebido_at)}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {badge && <Badge className={cn("shrink-0", badge.className)}>{badge.label}</Badge>}
            {agendou && (
              <Badge variant="outline" className="border-emerald-500 text-emerald-700 dark:text-emerald-400">
                Agendou
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="space-y-1 rounded-md border bg-muted/30 p-2.5">
          <TrackLine icon={Send} label="Enviado" ts={sentTs} active={!!sentTs} tone="slate" />
          <TrackLine
            icon={Check}
            label="Entregue"
            ts={deliveredTs}
            active={status === "delivered" || status === "read"}
            tone="blue"
          />
          <TrackLine icon={Eye} label="Lido" ts={readTs} active={status === "read"} tone="emerald" />
          <TrackLine
            icon={CalendarCheck}
            label="Agendou retirada"
            active={agendou}
            tone="emerald"
          />
        </div>

        {falhou && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">
                {semTelefone ? "Cliente sem telefone cadastrado" : "Cliente NÃO foi avisado"}
              </div>
              {semTelefone ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Cadastre o telefone da cliente para reenviar o aviso.
                </div>
              ) : (
                row.wa_status_reason && (
                  <div className="mt-0.5 break-words text-xs text-muted-foreground">
                    {row.wa_status_reason}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {falhou && !editando && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant={semTelefone ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setEditando(true)}
            >
              <Phone className="h-4 w-4" />
              {semTelefone ? "Cadastrar telefone" : "Corrigir telefone"}
            </Button>
            {!semTelefone && (
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={reenviar}
                disabled={resending}
              >
                {resending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Reenviando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" /> Reenviar aviso
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {!falhou && status === "sent" && !readTs && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={reenviar}
            disabled={resending}
          >
            {resending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reenviando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" /> Reenviar aviso
              </>
            )}
          </Button>
        )}

        {falhou && editando && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <label className="text-xs font-medium text-muted-foreground">
              Telefone do WhatsApp (com DDD)
            </label>
            <Input
              inputMode="tel"
              autoFocus
              placeholder="(11) 91234-5678"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefoneBR(e.target.value))}
              disabled={salvando}
            />
            <p className="text-[11px] text-muted-foreground">
              Será gravado no cadastro do cliente no Atrium e o aviso da OS será reenviado.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={salvarTelefone}
                disabled={salvando || !telefoneValido(telefone)}
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Salvar e reenviar
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditando(false);
                  setTelefone("");
                }}
                disabled={salvando}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LojaRecebimentoOS() {
  const { user } = useAuth();
  const { lojasFiltro } = useFiltroLoja();
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // Atrium armazena loja_nome em MAIÚSCULAS e com numerais romanos ("PRIMITIVA I").
  // O filtro do app pode vir como "Primitiva 1" — normalizar antes de comparar.
  const lojasUpper = useMemo(
    () => Array.from(new Set(lojasFiltro.map((l) => normalizarNomeLoja(l)))),
    [lojasFiltro],
  );

  const loadHistorico = useCallback(async () => {
    if (!user) return;
    setLoadingHist(true);
    let q = supabase
      .from("os_recebimento_loja" as any)
      .select(
        "id, os_numero, cliente_nome, loja_nome, recebido_at, notificado_cliente_at, wa_status, wa_status_at, wa_status_reason, agendamento_id",
      )
      .not("recebido_at", "is", null)
      .order("recebido_at", { ascending: false })
      .limit(100);
    if (lojasUpper.length) q = q.in("loja_nome", lojasUpper);
    const { data, error } = await q;
    if (error) {
      console.error("[recebimento-os] loadHistorico:", error);
    } else {
      console.info("[recebimento-os] loadHistorico", {
        lojasUpper,
        rows: (data as any[] | null)?.length ?? 0,
      });
    }
    setHistorico(((data as any) ?? []) as HistoricoRow[]);
    setLoadingHist(false);
  }, [user, lojasUpper]);

  useEffect(() => {
    document.title = "Recebimento de OS";
  }, []);

  // Recarrega quando o filtro muda (e há dados abertos)
  useEffect(() => {
    void loadHistorico();
  }, [loadHistorico]);

  // Realtime
  useEffect(() => {
    if (!user || lojasUpper.length === 0) return;
    const filter = `loja_nome=in.(${lojasUpper.map((l) => `"${l.replace(/"/g, '\\"')}"`).join(",")})`;
    const ch = supabase
      .channel(`os-recebidas-loja-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_recebimento_loja", filter },
        () => void loadHistorico(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, lojasUpper, loadHistorico]);


  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-4 py-4 md:py-6">
      <header className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <PackageCheck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Recebimento de OS</h1>
          <p className="text-sm text-muted-foreground">
            Digite o número da OS para conferir os dados e confirmar.
          </p>
        </div>
      </header>

      <Tabs defaultValue="buscar">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buscar">Buscar OS</TabsTrigger>
          <TabsTrigger value="historico">Já recebidas</TabsTrigger>
        </TabsList>

        <TabsContent value="buscar">
          <BuscarOS />
        </TabsContent>

        <TabsContent value="historico" className="space-y-3">
          {loadingHist ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Nada por aqui ainda.
            </div>
          ) : (
            historico.map((r) => <HistoricoCard key={r.id} row={r} onChanged={loadHistorico} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

