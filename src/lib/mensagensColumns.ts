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
    if (!error) {
      // Colunas existem.
      cached = true;
    } else if (error.code === "42703") {
      // Colunas confirmadamente não existem — memoiza definitivamente.
      cached = false;
    } else {
      // Qualquer outro erro (RLS, rede, 401, etc.): assume que NÃO existem
      // (mais seguro: mantém o select restrito ao BASE) e NÃO memoiza,
      // permitindo nova tentativa na próxima chamada.
      probePromise = null;
      return false;
    }
    return cached;
  })();
  const result = await probePromise;
  // Se decidimos não memoizar (erro transitório), limpar o promise cache.
  if (cached === null) probePromise = null;
  return result;
}

export async function mensagensSelectColumns(): Promise<string> {
  return (await hasEditDeleteColumns()) ? BASE_COLUMNS + EXTRA_COLUMNS : BASE_COLUMNS;
}

export function getMensagensSelectColumnsSync(): string {
  return cached ? BASE_COLUMNS + EXTRA_COLUMNS : BASE_COLUMNS;
}

/** Invalida o cache para forçar nova checagem (ex.: depois de um 42703 no select real). */
export function resetMensagensColumnsCache() {
  cached = null;
  probePromise = null;
}

export const MENSAGENS_BASE_COLUMNS = BASE_COLUMNS;
