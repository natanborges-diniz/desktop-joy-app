import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, PackageCheck, CheckCircle2, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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

type HistoricoRow = {
  id: string;
  os_numero: string | null;
  numero_os?: string | null;
  cliente_nome: string | null;
  produto: string | null;
  loja_nome: string | null;
  recebido_at: string | null;
  recebido_por_nome: string | null;
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

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function BuscarOS() {
  const { lojaNome } = useLojaContext();
  const [osNumero, setOsNumero] = useState("");
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [lastQuery, setLastQuery] = useState<string>("");

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    const numero = osNumero.trim();
    if (!numero) return;
    setSearching(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("confirmar-recebimento-os", {
        body: { action: "preview", os_numero: numero, loja_nome: lojaNome ?? null },
      });
      if (error) throw error;
      const resp = (data ?? {}) as PreviewResponse;
      if (resp.error) throw new Error(resp.error);
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

function HistoricoCard({ row }: { row: HistoricoRow }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">OS {row.os_numero ?? row.numero_os ?? "—"}</CardTitle>
          {row.loja_nome && (
            <Badge variant="outline" className="shrink-0">
              {row.loja_nome}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0 text-sm">
        <div>
          <span className="text-muted-foreground">Cliente: </span>
          <span className="text-foreground">{row.cliente_nome ?? "—"}</span>
        </div>
        {row.produto && (
          <div>
            <span className="text-muted-foreground">Produto: </span>
            <span className="text-foreground">{row.produto}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Recebido em: </span>
          <span className="text-foreground">{formatDate(row.recebido_at)}</span>
          {row.recebido_por_nome && (
            <span className="text-muted-foreground"> por {row.recebido_por_nome}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function LojaRecebimentoOS() {
  const { user } = useAuth();
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  async function loadHistorico() {
    if (!user) return;
    setLoadingHist(true);
    const { data } = await supabase
      .from("os_recebimento_loja" as any)
      .select("*")
      .not("recebido_at", "is", null)
      .order("recebido_at", { ascending: false })
      .limit(50);
    setHistorico(((data as any) ?? []) as HistoricoRow[]);
    setLoadingHist(false);
  }

  useEffect(() => {
    document.title = "Recebimento de OS";
  }, []);

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

      <Tabs
        defaultValue="buscar"
        onValueChange={(v) => {
          if (v === "historico") void loadHistorico();
        }}
      >
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
            historico.map((r) => <HistoricoCard key={r.id} row={r} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
