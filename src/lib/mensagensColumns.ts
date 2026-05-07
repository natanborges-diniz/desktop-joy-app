// Fallback resiliente para as colunas `editada_em` / `apagada_em`
// (adicionadas em uma migração que precisa ser rodada manualmente
// no Supabase do atrium-link). Enquanto a migração não rodar, o app
// continua funcionando — só não mostra as ações de editar/apagar.

import { supabase } from "@/integrations/supabase/client";

const BASE_COLUMNS =
  "id,conversa_id,remetente_id,destinatario_id,conteudo,lida,created_at,anexo_url,anexo_tipo";
const EXTRA_COLUMNS = ",editada_em,apagada_em";

let cached: boolean | null = null;
let probePromise: Promise<boolean> | null = null;

export async function hasEditDeleteColumns(): Promise<boolean> {
  if (cached !== null) return cached;
  if (probePromise) return probePromise;
  probePromise = (async () => {
    const { error } = await supabase
      .from("mensagens_internas")
      .select("editada_em,apagada_em")
      .limit(1);
    cached = !error || error.code !== "42703";
    return cached;
  })();
  return probePromise;
}

export async function mensagensSelectColumns(): Promise<string> {
  return (await hasEditDeleteColumns()) ? BASE_COLUMNS + EXTRA_COLUMNS : BASE_COLUMNS;
}

export function getMensagensSelectColumnsSync(): string {
  return cached ? BASE_COLUMNS + EXTRA_COLUMNS : BASE_COLUMNS;
}
