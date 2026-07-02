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
 *  - `regua_inscricao` usa `cod_empresa` (bigint) para identificar a loja.
 *  - `lojas_cidades` mapeia id (uuid) <-> cod_empresa (bigint) + nome.
 *  - `user_acessos` guarda `loja_id` (uuid de lojas_cidades) por usuario.
 *
 * Fluxo:
 *  1. Le user_acessos -> lista de loja_id.
 *  2. Le lojas_cidades filtrando por esses ids -> lista de cod_empresa e nomes.
 *  3. Consulta regua_inscricao com .in('cod_empresa', codEmpresas).
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

    // 1) lojas do usuario (uuid ids em user_acessos.loja_id)
    const lojaIds = new Set<string>();
    try {
      const { data } = await supabase
        .from("user_acessos" as any)
        .select("loja_id, ativo")
        .eq("user_id", user.id);
      for (const r of (data as any[] | null) ?? []) {
        if (r && (r.ativo === true || r.ativo == null) && r.loja_id) {
          lojaIds.add(String(r.loja_id));
        }
      }
    } catch {
      /* ignore */
    }

    // 2) resolve cod_empresa via lojas_cidades
    const codEmpresas: string[] = [];
    const nomeByCod = new Map<string, string>();
    if (lojaIds.size > 0) {
      const { data: lc, error: lcErr } = await supabase
        .from("lojas_cidades" as any)
        .select("id, cod_empresa, nome, nome_cidade")
        .in("id", [...lojaIds]);
      if (lcErr) {
        setError(lcErr.message);
        setRows([]);
        setLoading(false);
        return;
      }
      for (const l of ((lc as any[]) ?? [])) {
        if (l?.cod_empresa != null) {
          const key = String(l.cod_empresa);
          codEmpresas.push(key);
          nomeByCod.set(key, String(l.nome ?? l.nome_cidade ?? "").trim());
        }
      }
    }

    if (codEmpresas.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 3) inscricoes com PIN pendente
    const { data, error: qErr } = await supabase
      .from("regua_inscricao" as any)
      .select("id, nome_cliente, cpf, whatsapp, cod_empresa, pin_expira_at, pin_tentativas, status, criado_em")
      .in("cod_empresa", codEmpresas)
      .eq("status", "ativa")
      .is("pin_validado_em", null)
      .not("pin_hash", "is", null)
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
