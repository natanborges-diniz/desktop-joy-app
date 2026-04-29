import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lista de lojas ativas (nome_loja únicos), usada quando o usuário não tem
 * uma loja vinculada e precisa escolher manualmente em uma etapa `tipo_input: "loja"`.
 */
export function useLojasAtivas() {
  return useQuery({
    queryKey: ["lojas-ativas"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telefones_lojas")
        .select("nome_loja")
        .eq("tipo", "loja")
        .eq("ativo", true)
        .order("nome_loja");
      if (error) throw error;
      const seen = new Set<string>();
      const out: string[] = [];
      for (const r of data ?? []) {
        const n = (r as { nome_loja: string | null }).nome_loja?.trim();
        if (!n) continue;
        const k = n.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(n);
      }
      return out;
    },
  });
}
