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
  pin_expira_at: string | null;
  pin_tentativas: number | null;
  status: string | null;
  criado_em: string;
};

/**
 * Inscricoes de cashback aguardando validacao de PIN.
 *
 * Backend legado (Atrium/Firebird):
 *  - `regua_inscricao` identifica loja por `cod_empresa` (bigint Firebird).
 *  - `telefones_lojas(cod_empresa, nome_loja, ativo)` mapeia nome -> cod_empresa.
 *  - `user_acessos(user_id, lojas text[], acesso_total)` define escopo do usuario.
 *  - Nao existem colunas `loja_id`/`pin_validado_em`/`ativo` em user_acessos/regua_inscricao.
 *
 * Fluxo:
 *  1. Le user_acessos -> nomes de loja (ou acesso_total).
 *  2. Resolve nomes -> cod_empresa em telefones_lojas.
 *  3. Consulta regua_inscricao com .in('cod_empresa', ...), pin_hash NOT NULL
 *     e pin_confirmado_at IS NULL. O status nao e fonte segura aqui: o fluxo
 *     cashback-loja/regua_registrar_venda grava inscricoes novas como
 *     `aguardando_entrega`, enquanto bases antigas podem usar `ativa`.
 */
export function usePinsPendentes() {
  const { user } = useAuth();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const [rows, setRows] = useState<InscricaoPendente[]>([]);
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

    // 1) Escopo do usuario
    let acessoTotal = false;
    const nomesUsuario = new Set<string>();
    try {
      const { data } = await supabase
        .from("user_acessos" as any)
        .select("lojas, acesso_total")
        .eq("user_id", user.id)
        .maybeSingle();
      const d = data as any;
      if (d?.acesso_total === true) acessoTotal = true;
      if (Array.isArray(d?.lojas)) {
        for (const n of d.lojas) {
          if (typeof n === "string" && n.trim()) nomesUsuario.add(normalizarNomeLoja(n));
        }
      }
    } catch {
      /* ignore */
    }

    // 2) telefones_lojas -> cod_empresa por nome
    const nomeByCod = new Map<string, string>();
    const codEmpresas: string[] = [];
    let tlQuery = supabase
      .from("telefones_lojas" as any)
      .select("cod_empresa, nome_loja")
      .limit(1000);
    const { data: tl, error: tlErr } = await tlQuery;
    if (tlErr) {
      setError(tlErr.message);
      setRows([]);
      setLoading(false);
      return;
    }
    for (const l of ((tl as any[]) ?? [])) {
      if (l?.cod_empresa == null || !l?.nome_loja) continue;
      const nomeNorm = normalizarNomeLoja(String(l.nome_loja));
      if (!acessoTotal && !nomesUsuario.has(nomeNorm)) continue;
      const cod = String(l.cod_empresa);
      codEmpresas.push(cod);
      nomeByCod.set(cod, String(l.nome_loja).trim());
    }

    if (codEmpresas.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 3) inscricoes pendentes
    const { data, error: qErr } = await supabase
      .from("regua_inscricao" as any)
      .select("id, nome_cliente, cpf, whatsapp, cod_empresa, pin_expira_at, pin_tentativas, status, criado_em")
      .in("cod_empresa", codEmpresas)
      .not("pin_hash", "is", null)
      .is("pin_confirmado_at", null)
      .order("criado_em", { ascending: false });

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
          pin_expira_at: r.pin_expira_at ?? null,
          pin_tentativas: r.pin_tentativas ?? null,
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
    const lojaKey = normalizarNomeLoja(lojaSelecionada);
    const mapeados = rows.filter((r) => r.loja_nome && normalizarNomeLoja(r.loja_nome) === lojaKey);
    return mapeados.length > 0 ? mapeados : rows.filter((r) => !r.loja_nome);
  }, [rows, lojaSelecionada]);

  const lojasSemMapeamento = useMemo(() => {
    if (lojasDoUsuario.length === 0) return [];
    const mapped = new Set(rows.map((r) => r.loja_nome).filter(Boolean) as string[]);
    return lojasDoUsuario.filter(
      (loja) => ![...mapped].some((m) => normalizarNomeLoja(m) === normalizarNomeLoja(loja)),
    );
  }, [lojasDoUsuario, rows]);

  return { items, loading, count: items.length, reload: load, error, lojasSemMapeamento };
}
