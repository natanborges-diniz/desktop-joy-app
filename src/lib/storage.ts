import { createClient } from "@supabase/supabase-js";

const STORAGE_URL = import.meta.env.VITE_SUPABASE_URL;
const STORAGE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const MENSAGENS_ANEXOS_BUCKET = "mensagens-anexos";
export const SOLICITACOES_ANEXOS_BUCKET = "solicitacao-anexos";

const storageClient = createClient(STORAGE_URL, STORAGE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "infoco-message-storage",
  },
});

export async function uploadPublicAttachment(params: {
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
}) {
  const { bucket, path, blob, contentType } = params;
  const { error } = await storageClient.storage.from(bucket).upload(path, blob, {
    contentType,
    upsert: false,
  });

  if (error) throw error;

  const { data } = storageClient.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}