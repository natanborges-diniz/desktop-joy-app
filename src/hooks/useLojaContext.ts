import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

export type LojaContext = {
  loading: boolean;
  lojaNome: string | null;
  codEmpresa: string | null;
  tipoUsuario: string | null;
  isLoja: boolean; // loja ou colaborador (vê área de demandas)
};

/**
 * Resolve a loja do usuário logado a partir de:
 *   user_roles.loja_nome  →  telefones_lojas.cod_empresa (join por nome)
 * E o tipo_usuario do profile.
 */
export function useLojaContext(): LojaContext {
  const { user, profile } = useAuth();
  const [lojaNome, setLojaNome] = useState<string | null>(null);
  const [codEmpresa, setCodEmpresa] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setLojaNome(null);
      setCodEmpresa(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("loja_nome")
        .eq("user_id", user.id)
        .not("loja_nome", "is", null)
        .limit(1)
        .maybeSingle();
      const nome = (roleRow as any)?.loja_nome ?? null;
      if (!alive) return;
      setLojaNome(nome);

      if (nome) {
        const { data: tel } = await supabase
          .from("telefones_lojas")
          .select("cod_empresa")
          .ilike("nome_loja", `%${nome}%`)
          .eq("ativo", true)
          .limit(1)
          .maybeSingle();
        if (!alive) return;
        setCodEmpresa((tel as any)?.cod_empresa ?? null);
      } else {
        setCodEmpresa(null);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const tipoUsuario = profile?.tipo_usuario ?? null;
  // Considera "loja" quem tem tipo_usuario loja/colaborador OU possui vínculo
  // em user_roles com uma loja_nome (cobre supervisor/gerente novos).
  const isLoja =
    tipoUsuario === "loja" ||
    tipoUsuario === "colaborador" ||
    tipoUsuario === "supervisor" ||
    tipoUsuario === "gerente" ||
    !!lojaNome;

  return { loading, lojaNome, codEmpresa, tipoUsuario, isLoja };
}
