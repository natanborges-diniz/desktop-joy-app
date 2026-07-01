import { supabase } from "@/integrations/supabase/client";

export type CashbackLojaInfo = {
  id?: string;
  nome?: string;
  cod_empresa?: string;
};

export type CashbackLojaMaps = {
  byId: Map<string, string>;
  byNome: Map<string, string[]>;
  infoByNome: Map<string, CashbackLojaInfo>;
};

export function normalizarNomeLoja(value: string) {
  const upper = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return upper
    .replace(/\bPRIMITIVA\s+1\b/g, "PRIMITIVA I")
    .replace(/\bPRIMITIVA\s+2\b/g, "PRIMITIVA II");
}

export async function carregarMapasLojasCashback(): Promise<CashbackLojaMaps> {
  const byId = new Map<string, string>();
  const byNome = new Map<string, string[]>();
  const infoByNome = new Map<string, CashbackLojaInfo>();

  const add = (id: unknown, nome: unknown, extra?: Partial<CashbackLojaInfo>) => {
    const idStr = String(id ?? "").trim();
    const nomeStr = typeof nome === "string" ? nome.trim() : "";
    if (!idStr || !nomeStr) return;
    byId.set(idStr, nomeStr);
    const key = normalizarNomeLoja(nomeStr);
    byNome.set(key, [...(byNome.get(key) ?? []), idStr]);
    infoByNome.set(key, { ...(infoByNome.get(key) ?? {}), ...extra, id: idStr, nome: nomeStr });
  };

  // Projeto cashback atual: lojas(id, nome). Pode não existir no backend legado.
  const lojasResp = await supabase.from("lojas" as any).select("id, nome").limit(1000);
  if (!lojasResp.error) {
    for (const loja of (lojasResp.data as any[] | null) ?? []) add(loja.id, loja.nome, { id: loja.id });
  }

  // Messenger legado: telefones_lojas(cod_empresa, nome_loja).
  const telefonesResp = await supabase
    .from("telefones_lojas" as any)
    .select("cod_empresa, nome_loja")
    .eq("ativo", true)
    .limit(1000);
  if (!telefonesResp.error) {
    for (const loja of (telefonesResp.data as any[] | null) ?? []) {
      add(loja.cod_empresa, loja.nome_loja, { cod_empresa: loja.cod_empresa });
    }
  }

  return { byId, byNome, infoByNome };
}

export function montarPayloadLoja(
  lojaNome: string | null | undefined,
  maps: CashbackLojaMaps | null | undefined,
): Record<string, unknown> {
  if (!lojaNome) return {};
  const key = normalizarNomeLoja(lojaNome);
  const ids = maps?.byNome.get(key) ?? [];
  const info = maps?.infoByNome.get(key);
  return {
    loja_nome: lojaNome,
    loja_id: info?.id ?? ids[0],
    cod_empresa: info?.cod_empresa ?? ids[0],
    loja: {
      nome_loja: lojaNome,
      id: info?.id ?? ids[0],
      cod_empresa: info?.cod_empresa ?? ids[0],
    },
  };
}