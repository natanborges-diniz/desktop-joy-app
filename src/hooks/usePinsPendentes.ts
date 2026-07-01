import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { carregarMapasLojasCashback, normalizarNomeLoja } from "@/lib/cashbackLoja";

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
 * Alem disso, respeita o chip de loja selecionado (FiltroLojaContext).
 *
 * Importante: no backend legado `regua_inscricao.loja_id` nao possui FK com
 * `lojas`, entao PostgREST nao aceita `lojas(nome)` dentro do select. Por isso
 * carregamos as inscricoes sem join e resolvemos loja_id -> nome separadamente.
 */
export function usePinsPendentes() {
  const { user } = useAuth();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const [rows, setRows] = useState<InscricaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolverLojas = useCallback(() => carregarMapasLojasCashback(), []);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const lojasMap = await resolverLojas();
    const selectBase = "id, contato_id, loja_id, valor_venda, valor_cashback, criado_em";
    let query = supabase
      .from("regua_inscricao" as any)
      .select(`${selectBase}, contatos(nome, telefone)`)
      .eq("status", "ativa")
      .is("pin_validado_em", null)
      .not("pin_hash", "is", null);

    let { data, error } = await query.order("criado_em", { ascending: false });

    // Bancos legados podem nao ter FK declarada para `contatos`, o que faz o
    // select embutido falhar. Nesse caso, carrega as inscricoes e busca os
    // contatos separadamente.
    let contatosById = new Map<string, { nome?: string | null; telefone?: string | null }>();
    if (error && /relationship|schema cache|contatos/i.test(error.message ?? "")) {
      let fallback = supabase
        .from("regua_inscricao" as any)
        .select(selectBase)
        .eq("status", "ativa")
        .is("pin_validado_em", null)
        .not("pin_hash", "is", null);
      const resp = await fallback.order("criado_em", { ascending: false });
      data = resp.data;
      error = resp.error;

      const contatoIds = [...new Set(((data ?? []) as any[]).map((r) => r.contato_id).filter(Boolean))];
      if (contatoIds.length > 0) {
        const contatosResp = await supabase
          .from("contatos" as any)
          .select("id, nome, telefone")
          .in("id", contatoIds)
          .limit(1000);
        if (!contatosResp.error) {
          contatosById = new Map(
            ((contatosResp.data ?? []) as any[]).map((c) => [String(c.id), { nome: c.nome, telefone: c.telefone }]),
          );
        }
      }
    }
    if (error) {
      setRows([]);
      setError(error.message || "Nao foi possivel carregar os PINs pendentes.");
    } else {
      const mapped = ((data ?? []) as any[]).map((r) => {
        const contatoFallback = contatosById.get(String(r.contato_id ?? ""));
        return {
          id: r.id,
          contato_id: r.contato_id ?? null,
          loja_id: r.loja_id ?? null,
          loja_nome: lojasMap.byId.get(String(r.loja_id ?? "")) ?? null,
          valor_venda: r.valor_venda ?? null,
          valor_cashback: r.valor_cashback ?? null,
          criado_em: r.criado_em,
          contato_nome: r.contatos?.nome ?? contatoFallback?.nome ?? null,
          contato_telefone: r.contatos?.telefone ?? contatoFallback?.telefone ?? null,
        };
      }) as InscricaoPendente[];
      setRows(mapped);
    }
    setLoading(false);
  }, [user, lojaSelecionada, resolverLojas]);

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
    const lojaKey = normalizarLoja(lojaSelecionada);
    const mapeados = rows.filter((r) => r.loja_nome && normalizarLoja(r.loja_nome) === lojaKey);
    // Se nao conseguimos resolver a loja_id -> nome (legado sem tabela/FK), nao
    // esconda o PIN pendente da loja: mostra como "loja nao mapeada" para o
    // operador poder validar em vez de ficar com a tela vazia.
    return mapeados.length > 0 ? mapeados : rows.filter((r) => !r.loja_nome);
  }, [rows, lojaSelecionada]);

  const lojasSemMapeamento = useMemo(() => {
    if (lojasDoUsuario.length === 0) return [];
    const mapped = new Set(rows.map((r) => r.loja_nome).filter(Boolean) as string[]);
    return lojasDoUsuario.filter((loja) => ![...mapped].some((m) => normalizarLoja(m) === normalizarLoja(loja)));
  }, [lojasDoUsuario, rows]);

  return { items, loading, count: items.length, reload: load, error, lojasSemMapeamento };
}

function normalizarLoja(value: string) {
  return normalizarNomeLoja(value);
}
