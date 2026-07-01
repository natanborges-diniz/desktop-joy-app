import { useEffect, useMemo, useState } from "react";
import { useFiltroLoja } from "@/context/FiltroLojaContext";
import { useLojaContext } from "@/hooks/useLojaContext";
import { carregarMapasLojasCashback, montarPayloadLoja, type CashbackLojaMaps } from "@/lib/cashbackLoja";

export function useCashbackLojaPayload() {
  const { lojaNome } = useLojaContext();
  const { lojaSelecionada, lojasDoUsuario } = useFiltroLoja();
  const lojaAtiva = lojaSelecionada ?? (lojasDoUsuario.length <= 1 ? lojaNome : null);
  const [maps, setMaps] = useState<CashbackLojaMaps | null>(null);

  useEffect(() => {
    let alive = true;
    carregarMapasLojasCashback().then((m) => {
      if (alive) setMaps(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => montarPayloadLoja(lojaAtiva, maps), [lojaAtiva, maps]);
}