// COLE NO PROJETO "InFoco Messenger" — substitua: src/pages/DemandasList.tsx
import { useEffect, useState } from "react";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { NovaDemandaWizard } from "@/components/NovaDemandaWizard";

type Demanda = {
  id: string;
  protocolo: string | null;
  assunto: string | null;
  pergunta: string | null;
  status: string | null;
  origem: string | null;
  tipo_chave: string | null;
  created_at: string;
};

export default function DemandasList() {
  const [items, setItems] = useState<Demanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("demandas_loja")
      .select("id,protocolo,assunto,pergunta,status,origem,tipo_chave,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data ?? []) as Demanda[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!wizardOpen) void load(); }, [wizardOpen]);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center justify-between md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Demandas</h1>
          <Button size="sm" variant="secondary" onClick={() => setWizardOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova
          </Button>
        </div>
        <p className="pb-3 text-sm text-white/80">Solicitações estruturadas para os setores</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-3 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma demanda ainda.</p>
            <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Abrir nova demanda
            </Button>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-3xl gap-3">
            {items.map((d) => (
              <li key={d.id}>
                <Card className="p-4 shadow-soft transition-shadow hover:shadow-elevated">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-primary">
                          {d.protocolo ?? "—"}
                        </span>
                        {d.origem === "interna" && (
                          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-accent-foreground">
                            Interna
                          </span>
                        )}
                      </div>
                      <h2 className="mt-1 truncate font-semibold text-foreground">
                        {d.assunto ?? d.pergunta?.slice(0, 80) ?? "Sem assunto"}
                      </h2>
                      {d.pergunta && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.pergunta}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground">
                      {d.status ?? "—"}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {format(new Date(d.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NovaDemandaWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
