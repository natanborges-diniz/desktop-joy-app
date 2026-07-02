import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { normalizarNomeLoja } from "@/lib/cashbackLoja";

export type InscricaoPendente = {
  id: string;
  nome_cliente: string | null;
  cpf: string | null;
  whatsapp: string | null;
  cod_empresa: string | null;
  loja_nome: string | null;
  numero_venda: string | null;
  valor_total_informado: number | null;
  pin_expira_at: string | null;
  pin_tentativas: number | null;
  pin_confirmado_at: string | null;
  status: string | null;
  criado_em: string;
};

/**
 * Inscricoes de cashback aguardando validacao de PIN.
 *
 * Backend legado (Atrium/Firebird):
 *  - `regua_inscricao` identifica loja por `cod_empresa` (text, codigo Firebird).
 *    NAO possui coluna `loja_id`.
 *  - `telefones_lojas(cod_empresa, nome_loja, tipo, ativo)` mapeia nome -> cod_empresa.
 *  - `user_acessos(user_id, lojas text[], acesso_total)` define escopo por NOMES.
 */
export function usePinsPendentes() {
  const { user } = useAuth();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const [rows, setRows] = useState<InscricaoPendente[]>([]);
  const [nomeByCodState, setNomeByCodState] = useState<Map<string, string>>(new Map());
  const [escopoCods, setEscopoCods] = useState<Set<string> | null>(null); // null = acesso_total
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // 1) Escopo do usuario (nomes)
    const { data: acesso } = await supabase
      .from("user_acessos" as any)
      .select("lojas, acesso_total")
      .eq("user_id", user.id)
      .maybeSingle();
    const acessoTotal = (acesso as any)?.acesso_total === true;
    const nomes: string[] = Array.isArray((acesso as any)?.lojas)
      ? ((acesso as any).lojas as string[]).filter((n) => typeof n === "string" && n.trim())
      : [];

    // 2) Mapear nome -> cod_empresa
    const nomeByCod = new Map<string, string>();
    let codsEmpresa: string[] | null = null;

    if (acessoTotal) {
      const { data: tl, error: tlErr } = await supabase
        .from("telefones_lojas" as any)
        .select("cod_empresa, nome_loja")
        .eq("tipo", "loja")
        .eq("ativo", true)
        .limit(2000);
      if (tlErr) {
        setError(tlErr.message);
        setRows([]);
        setLoading(false);
        return;
      }
      for (const l of (tl as any[] | null) ?? []) {
        if (l?.cod_empresa == null || !l?.nome_loja) continue;
        nomeByCod.set(String(l.cod_empresa), String(l.nome_loja).trim());
      }
    } else {
      if (nomes.length === 0) {
        setRows([]);
        setEscopoCods(new Set());
        setNomeByCodState(nomeByCod);
        setLoading(false);
        return;
      }
      const { data: tl, error: tlErr } = await supabase
        .from("telefones_lojas" as any)
        .select("cod_empresa, nome_loja")
        .eq("tipo", "loja")
        .eq("ativo", true)
        .in("nome_loja", nomes);
      if (tlErr) {
        setError(tlErr.message);
        setRows([]);
        setLoading(false);
        return;
      }
      for (const l of (tl as any[] | null) ?? []) {
        if (l?.cod_empresa == null || !l?.nome_loja) continue;
        nomeByCod.set(String(l.cod_empresa), String(l.nome_loja).trim());
      }
      codsEmpresa = [...new Set([...nomeByCod.keys()])];
      if (codsEmpresa.length === 0) {
        setRows([]);
        setEscopoCods(new Set());
        setNomeByCodState(nomeByCod);
        setLoading(false);
        return;
      }
    }

    setNomeByCodState(nomeByCod);
    setEscopoCods(codsEmpresa ? new Set(codsEmpresa) : null);

    // 3) Query da inscricao — SEM loja_id
    let q = supabase
      .from("regua_inscricao" as any)
      .select(
        "id, nome_cliente, cpf, whatsapp, cod_empresa, numero_venda, valor_total_informado, pin_expira_at, pin_tentativas, pin_confirmado_at, status, criado_em",
      )
      .eq("status", "ativa")
      .is("pin_confirmado_at", null)
      .not("pin_hash", "is", null)
      .gt("pin_expira_at", new Date().toISOString())
      .order("criado_em", { ascending: false });

    if (codsEmpresa) q = q.in("cod_empresa", codsEmpresa);

    const { data, error: qErr } = await q;

    if (qErr) {
      setError(qErr.message || "Nao foi possivel carregar os PINs pendentes.");
      setRows([]);
    } else {
      const mapped = ((data as any[]) ?? []).map((r) => {
        const cod = r.cod_empresa != null ? String(r.cod_empresa) : null;
        return {
          id: r.id,
          nome_cliente: r.nome_cliente ?? null,
          cpf: r.cpf ?? null,
          whatsapp: r.whatsapp ?? null,
          cod_empresa: cod,
          loja_nome: cod ? nomeByCod.get(cod) ?? null : null,
          numero_venda: r.numero_venda ?? null,
          valor_total_informado:
            r.valor_total_informado != null ? Number(r.valor_total_informado) : null,
          pin_expira_at: r.pin_expira_at ?? null,
          pin_tentativas: r.pin_tentativas ?? null,
          pin_confirmado_at: r.pin_confirmado_at ?? null,
          status: r.status ?? null,
          criado_em: r.criado_em,
        } as InscricaoPendente;
      });
      setRows(mapped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: filter in(...) nao e suportado; escutamos status=eq.ativa e refetch.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`regua-inscricao-pins-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "regua_inscricao",
          filter: "status=eq.ativa",
        },
        (payload) => {
          const cod =
            (payload.new as any)?.cod_empresa ?? (payload.old as any)?.cod_empresa;
          // Se ha escopo, descarta eventos fora dele (client-side).
          if (escopoCods && cod != null && !escopoCods.has(String(cod))) return;
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, load, escopoCods]);

  const items = useMemo(() => {
    if (!lojaSelecionada) return rows;
    const lojaKey = normalizarNomeLoja(lojaSelecionada);
    const mapeados = rows.filter(
      (r) => r.loja_nome && normalizarNomeLoja(r.loja_nome) === lojaKey,
    );
    return mapeados.length > 0 ? mapeados : rows.filter((r) => !r.loja_nome);
  }, [rows, lojaSelecionada]);

  const lojasSemMapeamento = useMemo(() => {
    if (lojasDoUsuario.length === 0) return [];
    const mapeadas = new Set(
      [...nomeByCodState.values()].map((n) => normalizarNomeLoja(n)),
    );
    return lojasDoUsuario.filter((loja) => !mapeadas.has(normalizarNomeLoja(loja)));
  }, [lojasDoUsuario, nomeByCodState]);

  return { items, loading, count: items.length, reload: load, error, lojasSemMapeamento };
}
