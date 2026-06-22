import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

export type OSRecebimentoRow = {
  id: string;
  numero_os: string | null;
  cliente_nome: string | null;
  produto: string | null;
  data_movimentacao: string | null;
  loja_nome: string | null;
  recebido_at: string | null;
  recebido_por: string | null;
  recebido_por_nome: string | null;
  created_at: string | null;
};

async function fetchLojas(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_acessos" as any)
    .select("lojas")
    .eq("user_id", userId)
    .maybeSingle();
  const arr = (data as any)?.lojas as string[] | null;
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}

export function useRecebimentoOSPendentes() {
  const instanceId = useId();
  const [rows, setRows] = useState<OSRecebimentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lojas, setLojas] = useState<string[]>([]);

  const refetch = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const userLojas = await fetchLojas(user.id);
    setLojas(userLojas);
    if (userLojas.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("os_recebimento_loja" as any)
      .select("*")
      .in("loja_nome", userLojas)
      .is("recebido_at", null)
      .order("data_movimentacao", { ascending: false, nullsFirst: false });
    if (!error) setRows(((data as any) ?? []) as OSRecebimentoRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`os-recebimento-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_recebimento_loja" },
        () => {
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  const removeLocal = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { rows, count: rows.length, loading, lojas, refetch, removeLocal };
}
