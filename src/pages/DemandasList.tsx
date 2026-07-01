// Fluxo B — Lista de demandas que o operador (Atrium) abriu para esta loja.
// Substitui o wizard antigo. O Fluxo A vive em /nova-demanda + /minhas-demandas.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardList, Loader2, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useLojaContext } from "@/hooks/useLojaContext";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PushGate } from "@/components/PushGate";
import { useAtrasoAlertSound } from "@/hooks/useAtrasoAlertSound";
import {
  escalonamentosDe,
  slaChipClass,
  slaLabel,
  slaLevelFromMinutes,
  slaMinutesSince,
} from "@/lib/sla";

type Demanda = {
  id: string;
  numero_curto: string | null;
  assunto: string | null;
  pergunta: string | null;
  status: string | null;
  loja_nome: string | null;
  solicitante_nome: string | null;
  ultima_mensagem_loja_at: string | null;
  vista_pelo_operador: boolean | null;
  created_at: string;
  updated_at?: string | null;
  metadata: Record<string, unknown> | null;
};

export default function DemandasList() {
  return (
    <PushGate>
      <DemandasListInner />
    </PushGate>
  );
}

function DemandasListInner() {
  const navigate = useNavigate();
  const { lojaNome, podeMenuLoja, loading: ctxLoading } = useLojaContext();
  const [items, setItems] = useState<Demanda[]>([]);
  const [loading, setLoading] = useState(true);
  // re-render a cada minuto para refrescar SLA
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  async function load() {
    if (!lojaNome) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const safe = lojaNome.replace(/"/g, '\\"');
    const { data } = await supabase
      .from("demandas_loja")
      .select(
        "id,numero_curto,assunto,pergunta,status,loja_nome,solicitante_nome,ultima_mensagem_loja_at,vista_pelo_operador,created_at,updated_at,metadata",
      )
      .or(
        `loja_nome.eq.${lojaNome},and(loja_nome.eq.__GRUPO__,metadata->lojas_nomes.cs.["${safe}"])`,
      )
      .neq("status", "encerrada")
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Demanda[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [lojaNome]);

  useEffect(() => {
    if (!lojaNome) return;
    const ch = supabase
      .channel(`demandas-${lojaNome}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demandas_loja" }, () =>
        void load(),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "demanda_mensagens" }, () =>
        void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [lojaNome]);

  const atrasadasIds = useMemo(
    () =>
      items
        .filter((d) => {
          const esc = escalonamentosDe(d.metadata);
          return d.status === "aberta" && !!esc.t30_at;
        })
        .map((d) => d.id),
    [items],
  );
  useAtrasoAlertSound(atrasadasIds);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Demandas</h1>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate("/nova-demanda")}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Nova
          </Button>
        </div>
        <p className="pb-3 text-sm text-white/80">Solicitações enviadas pelo operador</p>
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
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma demanda recebida.</p>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-3xl gap-3">
            {items.map((d) => {
              const grupo = (d.metadata as any)?.grupo === true;
              const lojas: string[] = (d.metadata as any)?.lojas_nomes ?? [];
              const esc = escalonamentosDe(d.metadata);
              const isAberta = d.status === "aberta";
              const t30 = !!esc.t30_at;
              const t60 = !!esc.t60_at;
              const isAtrasada = isAberta && t30;
              const isSemResposta = d.status === "sem_resposta";
              const slaMin = slaMinutesSince(d.updated_at ?? d.ultima_mensagem_loja_at ?? d.created_at);
              const slaLvl = slaLevelFromMinutes(slaMin);
              return (
                <li key={d.id}>
                  <Card
                    className={
                      "cursor-pointer p-4 shadow-soft transition-shadow hover:shadow-elevated " +
                      (isAtrasada || isSemResposta
                        ? "ring-2 ring-red-500/40 "
                        : "")
                    }
                    onClick={() => navigate(`/demandas/${d.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                            {d.numero_curto ?? "—"}
                          </span>
                          {grupo && (
                            <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-accent-foreground">
                              <Users className="h-3 w-3" /> Grupo · {lojas.length}
                            </span>
                          )}
                          {d.vista_pelo_operador === false && (
                            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                              Nova
                            </span>
                          )}
                          {isSemResposta && (
                            <span className="inline-flex animate-pulse items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                              <AlertTriangle className="h-3 w-3" /> Sem resposta
                            </span>
                          )}
                          {isAtrasada && !isSemResposta && (
                            <span
                              className={
                                "inline-flex animate-pulse items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow " +
                                (t60 ? "bg-red-700" : "bg-red-500")
                              }
                            >
                              <AlertTriangle className="h-3 w-3" /> Atrasada
                            </span>
                          )}
                          <span
                            className={
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                              slaChipClass(slaLvl)
                            }
                            title="Tempo desde a última atualização"
                          >
                            SLA {slaLabel(slaMin)}
                          </span>
                        </div>
                        <h2 className="mt-1 truncate font-semibold text-foreground">
                          {d.assunto ?? d.pergunta?.slice(0, 80) ?? "Sem assunto"}
                        </h2>
                        {d.pergunta && (
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {d.pergunta}
                          </p>
                        )}
                        {d.solicitante_nome && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            de {d.solicitante_nome}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
                        {d.status ?? "—"}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {format(
                        new Date(d.ultima_mensagem_loja_at ?? d.created_at),
                        "d MMM yyyy 'às' HH:mm",
                        { locale: ptBR },
                      )}
                    </div>
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
