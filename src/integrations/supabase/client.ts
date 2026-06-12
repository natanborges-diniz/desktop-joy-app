import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "infoco-message-auth",
    flowType: "pkce",
  },
});

export type Profile = {
  id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  setor_id: string | null;
  avatar_url: string | null;
  ativo: boolean | null;
  tipo_usuario?: string | null;
};

export const SOLICITACAO_ANEXOS_BUCKET = "solicitacao-anexos";

export type MensagemInterna = {
  id: string;
  conversa_id?: string | null;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string;
  lida: boolean | null;
  created_at: string;
  anexo_url?: string | null;
  anexo_tipo?: string | null;
  editada_em?: string | null;
  apagada_em?: string | null;
};

export const ANEXOS_BUCKET = "mensagens-anexos";
