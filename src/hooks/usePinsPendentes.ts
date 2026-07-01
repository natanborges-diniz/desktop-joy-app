import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

export type InscricaoPendente = {
  id: string;
  contato_id: string | null;
  loja_id: string | null;
  valor_venda: number | null;
  valor_cashback: number | null;
  criado_em: string;
  contato_nome: string | null;
  contato_telefone: string | null;
};

/**
 * Lista/contagem de inscricoes de cashback aguardando validacao de PIN.
 * RLS do backend ja restringe as inscricoes as lojas do usuario logado.
 */
export function usePinsPendentes() {
  const { user } = useAuth();
  const [items, setItems] = useState<InscricaoPendente[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("regua_inscricao" as any)
      .select(
        "id, contato_id, loja_id, valor_venda, valor_cashback, criado_em, contatos(nome, telefone)",
      )
      .eq("status", "ativa")
      .is("pin_validado_em", null)
      .not("pin_hash", "is", null)
      .order("criado_em", { ascending: false });
    if (!error) {
      const rows = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        contato_id: r.contato_id ?? null,
        loja_id: r.loja_id ?? null,
        valor_venda: r.valor_venda ?? null,
        valor_cashback: r.valor_cashback ?? null,
        criado_em: r.criado_em,
        contato_nome: r.contatos?.nome ?? null,
        contato_telefone: r.contatos?.telefone ?? null,
      })) as InscricaoPendente[];
      setItems(rows);
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

  return { items, loading, count: items.length, reload: load };
}
