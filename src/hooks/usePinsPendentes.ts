import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { normalizarNomeLoja } from "@/lib/cashbackLoja";

export type CreditoInfo = {
  valor: number | null;
  libera_em: string | null;
  status: string | null;
};

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

export type PinBuckets = {
  aguardando: InscricaoPendente[];
  expirados: InscricaoPendente[];
  confirmadosHoje: InscricaoPendente[];
};

type Aba = "aguardando" | "expirados" | "confirmados_hoje";

function mapRow(r: any): InscricaoPendente {
  const cod = r.cod_empresa != null ? String(r.cod_empresa) : null;
  const credito: CreditoInfo | null =
    r.cashback_ativado != null || r.cashback_libera != null
      ? {
          valor: r.cashback_ativado != null ? Number(r.cashback_ativado) : null,
          libera_em: r.cashback_libera ?? null,
          status: "ativo",
        }
      : null;
  return {
    id: r.id,
    nome_cliente: r.nome_cliente ?? null,
    cpf: r.cpf ?? null,
    whatsapp: r.whatsapp ?? null,
    cod_empresa: cod,
    loja_nome: r.nome_loja ?? null,
    numero_venda: r.numero_venda ?? null,
    valor_total_informado:
      r.valor_total_informado != null ? Number(r.valor_total_informado) : null,
    pin_expira_at: r.pin_expira_at ?? null,
    pin_tentativas: r.pin_tentativas ?? null,
    pin_confirmado_at: r.pin_confirmado_at ?? null,
    status: r.status ?? null,
    criado_em: r.criado_em,
    credito,
  };
}

async function fetchAba(aba: Aba): Promise<InscricaoPendente[]> {
  const { data, error } = await supabase.rpc(
    "regua_listar_pins_por_usuario" as any,
    { p_aba: aba },
  );
  if (error) throw error;
  return ((data as any[]) ?? []).map(mapRow);
}

export function usePinsPendentes() {
  const { user } = useAuth();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const [buckets, setBuckets] = useState<PinBuckets>({
    aguardando: [],
    expirados: [],
    confirmadosHoje: [],
  });
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
    try {
      const [aguardando, expirados, confirmadosHoje] = await Promise.all([
        fetchAba("aguardando"),
        fetchAba("expirados"),
        fetchAba("confirmados_hoje"),
      ]);
      setBuckets({ aguardando, expirados, confirmadosHoje });
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar PINs");
      setBuckets({ aguardando: [], expirados: [], confirmadosHoje: [] });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const uniq =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(`regua-inscricao-pins-${user.id}-${uniq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "regua_inscricao" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, load]);

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

  const aguardando = useMemo(
    () => filtrarPorLoja(buckets.aguardando),
    [buckets.aguardando, filtrarPorLoja],
  );
  const expirados = useMemo(
    () => filtrarPorLoja(buckets.expirados),
    [buckets.expirados, filtrarPorLoja],
  );
  const confirmadosHoje = useMemo(
    () => filtrarPorLoja(buckets.confirmadosHoje),
    [buckets.confirmadosHoje, filtrarPorLoja],
  );

  const lojasSemMapeamento = useMemo(() => {
    if (lojasDoUsuario.length === 0) return [];
    const nomesRetornados = new Set<string>();
    for (const r of [...buckets.aguardando, ...buckets.expirados, ...buckets.confirmadosHoje]) {
      if (r.loja_nome) nomesRetornados.add(normalizarNomeLoja(r.loja_nome));
    }
    // Só reportamos falta de mapeamento quando há algum registro; caso contrário
    // não conseguimos distinguir "sem mapeamento" de "sem PINs".
    if (nomesRetornados.size === 0) return [];
    return lojasDoUsuario.filter((loja) => !nomesRetornados.has(normalizarNomeLoja(loja)));
  }, [lojasDoUsuario, buckets]);

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
