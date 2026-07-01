import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useFiltroLoja } from "@/context/FiltroLojaContext";

export type InscricaoPendente = {
  id: string;
  contato_id: string | null;
  loja_id: string | null;
  loja_nome: string | null;
  valor_venda: number | null;
  valor_cashback: number | null;
  criado_em: string;
  contato_nome: string | null;
  contato_telefone: string | null;
};

/**
 * Lista/contagem de inscricoes de cashback aguardando validacao de PIN.
 * RLS do backend ja restringe as inscricoes as lojas do usuario logado.
 * Alem disso, respeita o chip de loja selecionado (FiltroLojaContext):
 *  - "Todas": mantem todas as lojas que o usuario tem acesso.
 *  - Loja X: filtra client-side por loja_nome === X (via join `lojas(nome)`).
 */
export function usePinsPendentes() {
  const { user } = useAuth();
  const { lojaSelecionada } = useFiltroLoja();
  const [rows, setRows] = useState<InscricaoPendente[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("regua_inscricao" as any)
      .select(
        "id, contato_id, loja_id, valor_venda, valor_cashback, criado_em, contatos(nome, telefone), lojas(nome)",
      )
      .eq("status", "ativa")
      .is("pin_validado_em", null)
      .not("pin_hash", "is", null)
      .order("criado_em", { ascending: false });
    if (!error) {
      const mapped = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        contato_id: r.contato_id ?? null,
        loja_id: r.loja_id ?? null,
        loja_nome: r.lojas?.nome ?? null,
        valor_venda: r.valor_venda ?? null,
        valor_cashback: r.valor_cashback ?? null,
        criado_em: r.criado_em,
        contato_nome: r.contatos?.nome ?? null,
        contato_telefone: r.contatos?.telefone ?? null,
      })) as InscricaoPendente[];
      setRows(mapped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`regua-inscricao-pins-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "regua_inscricao" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, load]);

  const items = useMemo(() => {
    if (!lojaSelecionada) return rows;
    return rows.filter((r) => r.loja_nome === lojaSelecionada);
  }, [rows, lojaSelecionada]);

  return { items, loading, count: items.length, reload: load };
}
