import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, PackageCheck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useRecebimentoOSPendentes,
  type OSRecebimentoRow,
} from "@/hooks/useRecebimentoOSPendentes";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function PendenteCard({
  row,
  onConfirmed,
}: {
  row: OSRecebimentoRow;
  onConfirmed: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function confirmar() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirmar-recebimento-os", {
        body: { os_recebimento_id: row.id },
      });
      if (error) throw error;
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error(String((data as any).error));
      }
      toast.success(`OS ${row.numero_os ?? ""} confirmada`, {
        description: "Cliente será notificado por WhatsApp.",
      });
      onConfirmed(row.id);
    } catch (e: any) {
      toast.error("Falha ao confirmar recebimento", {
        description: e?.message ?? "Tente novamente em instantes.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">OS {row.numero_os ?? "—"}</CardTitle>
          {row.loja_nome && (
            <Badge variant="secondary" className="shrink-0">
              {row.loja_nome}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="text-sm">
          <span className="text-muted-foreground">Cliente: </span>
          <span className="font-medium text-foreground">{row.cliente_nome ?? "—"}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Produto: </span>
          <span className="text-foreground">{row.produto ?? "—"}</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Movimentado em: </span>
          <span className="text-foreground">{formatDate(row.data_movimentacao)}</span>
        </div>
        <Button onClick={confirmar} disabled={loading} className="mt-2 w-full">
          {loading ? (
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
  );
}

function HistoricoCard({ row }: { row: OSRecebimentoRow }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">OS {row.numero_os ?? "—"}</CardTitle>
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
        <div>
          <span className="text-muted-foreground">Produto: </span>
          <span className="text-foreground">{row.produto ?? "—"}</span>
        </div>
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
  const { rows, loading, lojas, removeLocal } = useRecebimentoOSPendentes();
  const [historico, setHistorico] = useState<OSRecebimentoRow[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  async function loadHistorico() {
    if (!user || lojas.length === 0) {
      setHistorico([]);
      return;
    }
    setLoadingHist(true);
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const { data } = await supabase
      .from("os_recebimento_loja" as any)
      .select("*")
      .in("loja_nome", lojas)
      .not("recebido_at", "is", null)
      .gte("recebido_at", desde.toISOString())
      .order("recebido_at", { ascending: false })
      .limit(200);
    setHistorico(((data as any) ?? []) as OSRecebimentoRow[]);
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
            Confirme o recebimento das OSs movimentadas no dia anterior.
          </p>
        </div>
      </header>

      <Tabs
        defaultValue="pendentes"
        onValueChange={(v) => {
          if (v === "historico") void loadHistorico();
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pendentes">
            Pendentes {rows.length > 0 && <Badge className="ml-2 h-5 px-1.5">{rows.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="historico">Já recebidas</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Nenhuma OS pendente. Tudo em dia!
            </div>
          ) : (
            rows.map((r) => <PendenteCard key={r.id} row={r} onConfirmed={removeLocal} />)
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-3">
          {loadingHist ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Nada nos últimos 30 dias.
            </div>
          ) : (
            historico.map((r) => <HistoricoCard key={r.id} row={r} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
