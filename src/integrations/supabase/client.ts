// Atrium Messenger conecta-se ao mesmo backend Supabase do projeto atrium-link.
// Usa apenas a anon key (publishable) — todas as regras de acesso são garantidas por RLS.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kvggebtnqmxydtwaumqz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Z2dlYnRucW14eWR0d2F1bXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDQ5OTAsImV4cCI6MjA4OTUyMDk5MH0.t9OTkyVB7daON1TQ24npjcc4cMDzFMMUPowXu1qcqR8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "atrium-messenger-auth",
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
};

export type MensagemInterna = {
  id: string;
  conversa_id?: string | null;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string;
  lida: boolean | null;
  created_at: string;
};
