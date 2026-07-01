import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

/**
 * Lista de lojas às quais o usuário logado tem acesso, lida de `user_acessos`.
 * Tolera dois formatos históricos:
 *  - linha-por-loja: colunas (user_id, loja_nome, ativo)
 *  - array agregado: coluna `lojas text[]` + acesso_total
 * Retorna sempre uma lista deduplicada e ordenada.
 */
export function useLojasDoUsuario() {
  const { user } = useAuth();
  const [lojas, setLojas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setLojas([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const out = new Set<string>();

      // Formato 1: linha por loja
      try {
        const { data } = await supabase
          .from("user_acessos" as any)
          .select("loja_nome, ativo")
          .eq("user_id", user.id);
        for (const r of (data as any[] | null) ?? []) {
          if (r && (r.ativo === true || r.ativo == null) && typeof r.loja_nome === "string") {
            const n = r.loja_nome.trim();
            if (n) out.add(n);
          }
        }
      } catch {
        /* ignore, tenta formato 2 */
      }

      // Formato 2: array agregado
      try {
        const { data } = await supabase
          .from("user_acessos" as any)
          .select("lojas")
          .eq("user_id", user.id)
          .maybeSingle();
        const arr = ((data as any)?.lojas as unknown) ?? null;
        if (Array.isArray(arr)) {
          for (const n of arr) {
            if (typeof n === "string" && n.trim()) out.add(n.trim());
          }
        }
      } catch {
        /* ignore */
      }

      if (!alive) return;
      const sorted = [...out].sort((a, b) => a.localeCompare(b, "pt-BR"));
      setLojas(sorted);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  return { lojas, loading };
}
