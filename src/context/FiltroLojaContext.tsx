import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { useLojasDoUsuario } from "@/hooks/useLojasDoUsuario";

type LojaBadges = { demandas: number; os: number };

type FiltroLojaCtx = {
  loading: boolean;
  lojasDoUsuario: string[];
  /** null = "Todas" */
  lojaSelecionada: string | null;
  setLojaSelecionada: (v: string | null) => void;
  /** Lista efetiva para queries: [lojaSelecionada] ou lojasDoUsuario quando "Todas" */
  lojasFiltro: string[];
  badges: Record<string, LojaBadges>;
  totalDemandas: number;
  totalOS: number;
};

const Ctx = createContext<FiltroLojaCtx | null>(null);
const LS_KEY = "messenger:filtro_loja";

export function FiltroLojaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { lojas, loading } = useLojasDoUsuario();
  const [lojaSelecionada, setLojaSelecionadaState] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      return v === "__ALL__" || v == null ? null : v;
    } catch {
      return null;
    }
  });
  const [badges, setBadges] = useState<Record<string, LojaBadges>>({});

  // Se a loja persistida não faz mais parte do acesso, reseta pra "Todas".
  useEffect(() => {
    if (!loading && lojaSelecionada && !lojas.includes(lojaSelecionada)) {
      setLojaSelecionadaState(null);
    }
    // Se só tem 1 loja, força ela como selecionada.
    if (!loading && lojas.length === 1 && lojaSelecionada !== lojas[0]) {
      setLojaSelecionadaState(lojas[0]);
    }
  }, [loading, lojas, lojaSelecionada]);

  const setLojaSelecionada = useCallback((v: string | null) => {
    setLojaSelecionadaState(v);
    try {
      localStorage.setItem(LS_KEY, v ?? "__ALL__");
    } catch {
      /* ignore */
    }
  }, []);

  const lojasFiltro = useMemo(
    () => (lojaSelecionada ? [lojaSelecionada] : lojas),
    [lojaSelecionada, lojas],
  );

  // ---- Badges: recalcula do zero + realtime por loja ----
  const recomputar = useCallback(async () => {
    if (!user || lojas.length === 0) {
      setBadges({});
      return;
    }
    // Atrium armazena loja_nome em MAIÚSCULAS na os_recebimento_loja.
    const lojasUpper = lojas.map((l) => l.toUpperCase());
    const upperToOriginal = new Map<string, string>();
    for (const l of lojas) upperToOriginal.set(l.toUpperCase(), l);

    const [demResp, osResp] = await Promise.all([
      supabase
        .from("demandas_loja")
        .select("loja_nome", { head: false })
        .in("loja_nome", lojas)
        .eq("vista_pelo_loja", false)
        .neq("status", "encerrada")
        .limit(1000),
      supabase
        .from("os_recebimento_loja" as any)
        .select("loja_nome")
        .in("loja_nome", lojasUpper)
        .is("confirmado_at", null)
        .limit(1000),
    ]);
    const map: Record<string, LojaBadges> = {};
    for (const l of lojas) map[l] = { demandas: 0, os: 0 };
    for (const r of (demResp.data ?? []) as { loja_nome: string | null }[]) {
      const n = r.loja_nome;
      if (n && map[n]) map[n].demandas += 1;
    }
    for (const r of ((osResp.data ?? []) as { loja_nome: string | null }[])) {
      const raw = r.loja_nome;
      if (!raw) continue;
      const orig = upperToOriginal.get(raw.toUpperCase());
      if (orig && map[orig]) map[orig].os += 1;
    }
    setBadges(map);
  }, [user, lojas]);


  useEffect(() => {
    void recomputar();
  }, [recomputar]);

  useEffect(() => {
    if (!user || lojas.length === 0) return;
    const filter = `loja_nome=in.(${lojas.map((l) => `"${l.replace(/"/g, '\\"')}"`).join(",")})`;
    const ch = supabase
      .channel(`filtro-loja-badges-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demandas_loja", filter },
        () => void recomputar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "os_recebimento_loja", filter },
        () => void recomputar(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, lojas, recomputar]);

  const totalDemandas = useMemo(
    () => Object.values(badges).reduce((s, b) => s + (b?.demandas ?? 0), 0),
    [badges],
  );
  const totalOS = useMemo(
    () => Object.values(badges).reduce((s, b) => s + (b?.os ?? 0), 0),
    [badges],
  );

  const value: FiltroLojaCtx = {
    loading,
    lojasDoUsuario: lojas,
    lojaSelecionada,
    setLojaSelecionada,
    lojasFiltro,
    badges,
    totalDemandas,
    totalOS,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFiltroLoja(): FiltroLojaCtx {
  const v = useContext(Ctx);
  if (!v) {
    // fallback defensivo — nunca deveria acontecer dentro do AppShell
    return {
      loading: false,
      lojasDoUsuario: [],
      lojaSelecionada: null,
      setLojaSelecionada: () => {},
      lojasFiltro: [],
      badges: {},
      totalDemandas: 0,
      totalOS: 0,
    };
  }
  return v;
}
