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
  credito?: CreditoInfo | null;
};

export type CreditoInfo = {
  valor: number | null;
  libera_em: string | null;
  status: string | null;
};

export type PinBuckets = {
  aguardando: InscricaoPendente[];
  expirados: InscricaoPendente[];
  confirmadosHoje: InscricaoPendente[];
};

const SELECT_COLS =
  "id, nome_cliente, cpf, whatsapp, cod_empresa, numero_venda, valor_total_informado, pin_expira_at, pin_tentativas, pin_confirmado_at, status, criado_em";

function mapRow(r: any, nomeByCod: Map<string, string>): InscricaoPendente {
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
  };
}

export function usePinsPendentes() {
  const { user, profile } = useAuth();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const [buckets, setBuckets] = useState<PinBuckets>({
    aguardando: [],
    expirados: [],
    confirmadosHoje: [],
  });
  const [nomeByCodState, setNomeByCodState] = useState<Map<string, string>>(new Map());
  const [escopoCods, setEscopoCods] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setBuckets({ aguardando: [], expirados: [], confirmadosHoje: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // 1) Escopo do usuario — user_acessos + fallback admin/user_roles
    const [acessoRes, rolesRes] = await Promise.all([
      supabase
        .from("user_acessos" as any)
        .select("lojas, acesso_total")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const acesso = acessoRes.data as any;
    const roles = ((rolesRes.data as any[]) ?? []).map((r) => String(r?.role ?? "").toLowerCase());
    const isAdminRole =
      roles.includes("admin") ||
      roles.includes("superadmin") ||
      String((profile as any)?.tipo_usuario ?? "").toLowerCase() === "admin";
    // Sem linha em user_acessos + role admin (ou tipo_usuario admin) => acesso total
    const acessoTotal = acesso?.acesso_total === true || (!acesso && isAdminRole) || isAdminRole;
    const nomes: string[] = Array.isArray(acesso?.lojas)
      ? (acesso.lojas as string[]).filter((n) => typeof n === "string" && n.trim())
      : [];

    // 2) Mapear nome -> cod_empresa
    const nomeByCod = new Map<string, string>();
    let codsEmpresa: string[] | null = null;

    const tlQuery = supabase
      .from("telefones_lojas" as any)
      .select("cod_empresa, nome_loja")
      .eq("tipo", "loja")
      .eq("ativo", true);
    const { data: tl, error: tlErr } = acessoTotal
      ? await tlQuery.limit(2000)
      : nomes.length > 0
      ? await tlQuery.in("nome_loja", nomes)
      : { data: [], error: null };

    if (tlErr) {
      setError(tlErr.message);
      setBuckets({ aguardando: [], expirados: [], confirmadosHoje: [] });
      setLoading(false);
      return;
    }
    for (const l of (tl as any[] | null) ?? []) {
      if (l?.cod_empresa == null || !l?.nome_loja) continue;
      nomeByCod.set(String(l.cod_empresa), String(l.nome_loja).trim());
    }
    if (!acessoTotal) {
      codsEmpresa = [...new Set(nomeByCod.keys())];
      if (codsEmpresa.length === 0) {
        setBuckets({ aguardando: [], expirados: [], confirmadosHoje: [] });
        setEscopoCods(new Set());
        setNomeByCodState(nomeByCod);
        setLoading(false);
        return;
      }
    }


    setNomeByCodState(nomeByCod);
    setEscopoCods(codsEmpresa ? new Set(codsEmpresa) : null);

    const nowIso = new Date().toISOString();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayIso = startOfDay.toISOString();

    // 3) Queries paralelas
    const baseAguardando = supabase
      .from("regua_inscricao" as any)
      .select(SELECT_COLS)
      .eq("status", "ativa")
      .is("pin_confirmado_at", null)
      .not("pin_hash", "is", null)
      .gt("pin_expira_at", nowIso)
      .lt("pin_tentativas", 3)
      .order("criado_em", { ascending: false });

    const baseExpirados = supabase
      .from("regua_inscricao" as any)
      .select(SELECT_COLS)
      .eq("status", "ativa")
      .is("pin_confirmado_at", null)
      .or(`pin_expira_at.lte.${nowIso},pin_tentativas.gte.3`)
      .order("criado_em", { ascending: false })
      .limit(200);

    const baseConfirmados = supabase
      .from("regua_inscricao" as any)
      .select(SELECT_COLS)
      .gte("pin_confirmado_at", startOfDayIso)
      .order("pin_confirmado_at", { ascending: false })
      .limit(200);

    const applyScope = (q: any) => (codsEmpresa ? q.in("cod_empresa", codsEmpresa) : q);

    const [rAg, rEx, rCf] = await Promise.all([
      applyScope(baseAguardando),
      applyScope(baseExpirados),
      applyScope(baseConfirmados),
    ]);

    if (rAg.error || rEx.error || rCf.error) {
      setError(rAg.error?.message || rEx.error?.message || rCf.error?.message || "Falha");
      setBuckets({ aguardando: [], expirados: [], confirmadosHoje: [] });
      setLoading(false);
      return;
    }

    const aguardando = ((rAg.data as any[]) ?? []).map((r) => mapRow(r, nomeByCod));
    const expirados = ((rEx.data as any[]) ?? []).map((r) => mapRow(r, nomeByCod));
    const confirmadosHoje = ((rCf.data as any[]) ?? []).map((r) => mapRow(r, nomeByCod));

    // 4) Join cashback_credito para confirmados
    if (confirmadosHoje.length > 0) {
      const ids = confirmadosHoje.map((c) => c.id);
      try {
        const { data: creditos } = await supabase
          .from("cashback_credito" as any)
          .select("inscricao_id, valor, valor_credito, libera_em, liberacao_em, data_liberacao, status")
          .in("inscricao_id", ids)
          .eq("status", "ativo");
        const byInsc = new Map<string, CreditoInfo>();
        for (const c of (creditos as any[] | null) ?? []) {
          byInsc.set(String(c.inscricao_id), {
            valor: c.valor != null ? Number(c.valor) : c.valor_credito != null ? Number(c.valor_credito) : null,
            libera_em: c.libera_em ?? c.liberacao_em ?? c.data_liberacao ?? null,
            status: c.status ?? null,
          });
        }
        for (const c of confirmadosHoje) c.credito = byInsc.get(c.id) ?? null;
      } catch {
        // tabela pode nao existir no ambiente atual; ignora
      }
    }

    setBuckets({ aguardando, expirados, confirmadosHoje });
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
        (payload) => {
          const cod =
            (payload.new as any)?.cod_empresa ?? (payload.old as any)?.cod_empresa;
          if (escopoCods && cod != null && !escopoCods.has(String(cod))) return;
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, load, escopoCods]);

  const filtrarPorLoja = useCallback(
    (list: InscricaoPendente[]) => {
      if (!lojaSelecionada) return list;
      const lojaKey = normalizarNomeLoja(lojaSelecionada);
      const mapeados = list.filter(
        (r) => r.loja_nome && normalizarNomeLoja(r.loja_nome) === lojaKey,
      );
      return mapeados.length > 0 ? mapeados : list.filter((r) => !r.loja_nome);
    },
    [lojaSelecionada],
  );

  const aguardando = useMemo(() => filtrarPorLoja(buckets.aguardando), [buckets.aguardando, filtrarPorLoja]);
  const expirados = useMemo(() => filtrarPorLoja(buckets.expirados), [buckets.expirados, filtrarPorLoja]);
  const confirmadosHoje = useMemo(
    () => filtrarPorLoja(buckets.confirmadosHoje),
    [buckets.confirmadosHoje, filtrarPorLoja],
  );

  const lojasSemMapeamento = useMemo(() => {
    if (lojasDoUsuario.length === 0) return [];
    const mapeadas = new Set([...nomeByCodState.values()].map((n) => normalizarNomeLoja(n)));
    return lojasDoUsuario.filter((loja) => !mapeadas.has(normalizarNomeLoja(loja)));
  }, [lojasDoUsuario, nomeByCodState]);

  return {
    aguardando,
    expirados,
    confirmadosHoje,
    loading,
    error,
    reload: load,
    lojasSemMapeamento,
  };
}
