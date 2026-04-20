import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Demanda = {
  id: string;
  titulo: string | null;
  descricao: string | null;
  status: string | null;
  prioridade: string | null;
  created_at: string;
};

export default function DemandasList() {
  const [items, setItems] = useState<Demanda[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase
      .from("demandas_loja")
      .select("id,titulo,descricao,status,prioridade,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setItems((data ?? []) as Demanda[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="bg-gradient-header px-4 pt-safe text-header-foreground">
        <div className="flex h-14 items-center md:h-16">
          <h1 className="text-lg font-semibold md:text-xl">Demandas</h1>
        </div>
        <p className="pb-3 text-sm text-white/80">Demandas das lojas e operações</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-2 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma demanda encontrada.</p>
          </div>
        ) : (
          <ul className="mx-auto grid max-w-3xl gap-3">
            {items.map((d) => (
              <li key={d.id}>
                <Card className="p-4 shadow-soft transition-shadow hover:shadow-elevated">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-foreground">
                        {d.titulo ?? "Sem título"}
                      </h2>
                      {d.descricao && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {d.descricao}
                        </p>
                      )}
                    </div>
                    {d.prioridade && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium uppercase text-accent-foreground">
                        {d.prioridade}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{d.status ?? "—"}</span>
                    <time>{format(new Date(d.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}</time>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
