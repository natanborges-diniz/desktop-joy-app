// Aba "Demandas das minhas lojas" — visível só para supervisor/gerente.
// Mostra demandas de profiles.lojas ∪ profiles.lojas_responsaveis,
// ordenadas por mais atrasada primeiro.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { Card } from "@/components/ui/card";
import { PushGate } from "@/components/PushGate";
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
  created_at: string;
  updated_at?: string | null;
  metadata: Record<string, unknown> | null;
};

export default function DemandasLojas() {
  return (
    <PushGate>
      <DemandasLojasInner />
    </PushGate>
  );
}

function DemandasLojasInner() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [lojas, setLojas] = useState<string[]>([]);
  const [cargoLoja, setCargoLoja] = useState<string | null>(null);
  const [items, setItems] = useState<Demanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  // Carrega lojas + cargo do profile (campos extras não tipados).
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("lojas,lojas_responsaveis,cargo_loja")
        .eq("id", user.id)
        .maybeSingle();
      const row = data as any;
      const arr: string[] = [
        ...((row?.lojas as string[]) ?? []),
        ...((row?.lojas_responsaveis as string[]) ?? []),
      ];
      const unique = Array.from(new Set(arr.filter(Boolean)));
      setLojas(unique);
      setCargoLoja((row?.cargo_loja as string) ?? null);
    })();
  }, [user]);

  const podeVer = cargoLoja === "supervisor" || cargoLoja === "gerente";

  async function load() {
    if (!podeVer || lojas.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("demandas_loja")
      .select(
        "id,numero_curto,assunto,pergunta,status,loja_nome,solicitante_nome,ultima_mensagem_loja_at,created_at,updated_at,metadata",
      )
      .in("loja_nome", lojas)
      .neq("status", "encerrada")
      .order("updated_at", { ascending: true })
      .limit(200);
    setItems((data ?? []) as Demanda[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [podeVer, lojas.join("|")]);

  useEffect(() => {
    if (!podeVer || lojas.length === 0) return;
    const ch = supabase
      .channel(`demandas-lojas-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "demandas_loja" }, () =>
        void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [podeVer, lojas.join("|"), user?.id]);

  // Ordena por mais atrasada primeiro (maior SLA em min).
  const ordenadas = useMemo(() => {
    return [...items].sort((a, b) => {
      const ma = slaMinutesSince(a.updated_at ?? a.ultima_mensagem_loja_at ?? a.created_at);
      const mb = slaMinutesSince(b.updated_at ?? b.ultima_mensagem_loja_at ?? b.created_at);
      return mb - ma;
    });
  }, [items]);

  if (profile && !podeVer) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Apenas supervisores e gerentes acessam as demandas das lojas supervisionadas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Demandas das minhas lojas</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">
          {lojas.length} loja{lojas.length === 1 ? "" : "s"} supervisionada
          {lojas.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : ordenadas.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Nenhuma demanda em aberto nas suas lojas.
          </p>
        ) : (
          <div className="mx-auto max-w-5xl">
            {/* Lista (mobile) */}
            <ul className="grid gap-3 md:hidden">
              {ordenadas.map((d) => (
                <DemandaCard key={d.id} d={d} onOpen={() => navigate(`/demandas/${d.id}`)} />
              ))}
            </ul>
            {/* Tabela (desktop) */}
            <div className="hidden md:block">
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Protocolo</th>
                      <th className="px-3 py-2">Loja</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">SLA</th>
                      <th className="px-3 py-2">Última atividade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenadas.map((d) => {
                      const ts = d.updated_at ?? d.ultima_mensagem_loja_at ?? d.created_at;
                      const min = slaMinutesSince(ts);
                      const lvl = slaLevelFromMinutes(min);
                      const esc = escalonamentosDe(d.metadata);
                      const atrasada = d.status === "aberta" && !!esc.t30_at;
                      const sem = d.status === "sem_resposta";
                      return (
                        <tr
                          key={d.id}
                          className="cursor-pointer border-t border-border hover:bg-muted/40"
                          onClick={() => navigate(`/demandas/${d.id}`)}
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {d.numero_curto ?? "—"}
                          </td>
                          <td className="px-3 py-2">{d.loja_nome ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                                {d.status ?? "—"}
                              </span>
                              {sem && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  <AlertTriangle className="h-3 w-3" /> Sem resposta
                                </span>
                              )}
                              {atrasada && !sem && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                  Atrasada
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold " +
                                slaChipClass(lvl)
                              }
                            >
                              {slaLabel(min)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {format(new Date(ts), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DemandaCard({ d, onOpen }: { d: Demanda; onOpen: () => void }) {
  const ts = d.updated_at ?? d.ultima_mensagem_loja_at ?? d.created_at;
  const min = slaMinutesSince(ts);
  const lvl = slaLevelFromMinutes(min);
  const esc = escalonamentosDe(d.metadata);
  const atrasada = d.status === "aberta" && !!esc.t30_at;
  const sem = d.status === "sem_resposta";
  return (
    <li>
      <Card
        className={
          "cursor-pointer p-4 shadow-soft hover:shadow-elevated " +
          (atrasada || sem ? "ring-2 ring-red-500/40" : "")
        }
        onClick={onOpen}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
            {d.numero_curto ?? "—"}
          </span>
          <span
            className={
              "rounded-full px-2 py-0.5 text-[10px] font-semibold " + slaChipClass(lvl)
            }
          >
            SLA {slaLabel(min)}
          </span>
          {sem && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Sem resposta
            </span>
          )}
          {atrasada && !sem && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Atrasada
            </span>
          )}
        </div>
        <h3 className="mt-1.5 truncate font-semibold">{d.loja_nome ?? "—"}</h3>
        <p className="truncate text-sm text-muted-foreground">
          {d.assunto ?? d.pergunta ?? "Sem assunto"}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {format(new Date(ts), "d MMM 'às' HH:mm", { locale: ptBR })}
        </p>
      </Card>
    </li>
  );
}
