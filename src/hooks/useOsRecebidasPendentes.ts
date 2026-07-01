import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useFiltroLoja } from "@/context/FiltroLojaContext";

const QUATRO_HORAS_MS = 4 * 60 * 60 * 1000;

/** Contagem de OS recebidas que precisam de atenção:
 *  - wa_status ∈ ('failed','no_dispatch')
 *  - wa_status = 'sent' há mais de 4h sem 'read'
 */
export function useOsRecebidasPendentes() {
  const { user } = useAuth();
  const { lojasFiltro } = useFiltroLoja();
  const lojasUpper = useMemo(() => lojasFiltro.map((l) => l.toUpperCase()), [lojasFiltro]);
  const [count, setCount] = useState(0);

  const recomputar = useCallback(async () => {
    if (!user || lojasUpper.length === 0) {
      setCount(0);
      return;
    }
    const { data } = await supabase
      .from("os_recebimento_loja" as any)
      .select("wa_status, wa_status_at, recebido_at")
      .in("loja_nome", lojasUpper)
      .not("recebido_at", "is", null)
      .limit(500);
    const rows = ((data as any[]) ?? []) as Array<{
      wa_status: string | null;
      wa_status_at: string | null;
      recebido_at: string | null;
    }>;
    const now = Date.now();
    let n = 0;
    for (const r of rows) {
      if (r.wa_status === "failed" || r.wa_status === "no_dispatch") {
        n += 1;
        continue;
      }
      if (r.wa_status === "sent") {
        const ref = r.wa_status_at ?? r.recebido_at;
        if (ref && now - new Date(ref).getTime() > QUATRO_HORAS_MS) n += 1;
      }
    }
    setCount(n);
  }, [user, lojasUpper]);

  useEffect(() => {
    void recomputar();
  }, [recomputar]);

  useEffect(() => {
    if (!user || lojasUpper.length === 0) return;
    const filter = `loja_nome=in.(${lojasUpper.map((l) => `"${l.replace(/"/g, '\\"')}"`).join(",")})`;
    const ch = supabase
      .channel(`os-recebidas-pendentes-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_recebimento_loja", filter },
        () => void recomputar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, lojasUpper, recomputar]);


  // Também revalida periodicamente (o critério "sent >4h" avança com o tempo).
  useEffect(() => {
    const t = setInterval(() => void recomputar(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [recomputar]);

  return { count };
}
