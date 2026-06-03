import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

export type LojaContext = {
  loading: boolean;
  lojaNome: string | null;
  codEmpresa: string | null;
  tipoUsuario: string | null;
  /** @deprecated Use podeMenuLoja / podeSupervisao */
  isLoja: boolean;
  // Fonte da verdade: user_acessos do Atrium
  acessoTotal: boolean;
  podeMenuLoja: boolean; // mostra Abrir / Agenda / Minhas / Demandas
  podeSupervisao: boolean; // mostra "Minhas lojas"
  podeChat1a1: boolean; // mostra Conversas
  podeChatGrupo: boolean; // mostra grupos
};

/**
 * Lê permissões de user_acessos (mesma fonte usada pelo Atrium).
 * tipo_usuario é apenas informativo — NUNCA usado para decidir menu.
 */
export function useLojaContext(): LojaContext {
  const { user, profile } = useAuth();
  const [lojaNome, setLojaNome] = useState<string | null>(null);
  const [codEmpresa, setCodEmpresa] = useState<string | null>(null);
  const [acesso, setAcesso] = useState<{
    acesso_total: boolean;
    modulos: Record<string, unknown>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setLojaNome(null);
      setCodEmpresa(null);
      setAcesso(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);

      // 1) user_acessos — fonte da verdade
      const { data: ua } = await supabase
        .from("user_acessos" as any)
        .select("acesso_total, modulos, lojas")
        .eq("user_id", user.id)
        .maybeSingle();

      if (alive) {
        setAcesso({
          acesso_total: !!(ua as any)?.acesso_total,
          modulos: ((ua as any)?.modulos as Record<string, unknown>) ?? {},
        });
      }

      // 2) loja vinculada (mantido p/ agenda/demandas filtrarem por loja_nome)
      const lojasArr = ((ua as any)?.lojas as string[] | null) ?? null;
      let nome: string | null = lojasArr?.[0] ?? null;

      if (!nome) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("loja_nome")
          .eq("user_id", user.id)
          .not("loja_nome", "is", null)
          .limit(1)
          .maybeSingle();
        nome = (roleRow as any)?.loja_nome ?? null;
      }
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

  const acessoTotal = !!acesso?.acesso_total;
  const has = (m: string) => acessoTotal || acesso?.modulos?.[m] != null;

  // Fallback legado: se usuário não tem linha em user_acessos, usa tipo_usuario + lojaNome
  const tipoUsuario = profile?.tipo_usuario ?? null;
  const legadoIsLoja =
    !acesso &&
    (tipoUsuario === "loja" ||
      tipoUsuario === "colaborador" ||
      tipoUsuario === "supervisor" ||
      tipoUsuario === "gerente" ||
      tipoUsuario === "setor_operador" ||
      tipoUsuario === "setor_gestor" ||
      !!lojaNome);
  const legadoIsSupervisor =
    !acesso && (tipoUsuario === "supervisor" || tipoUsuario === "gerente");

  const podeMenuLoja = has("menu_loja") || legadoIsLoja;
  const podeSupervisao = has("demandas_minhas_lojas") || legadoIsSupervisor;
  const podeChat1a1 = has("chat_1a1") || !acesso; // legado: todos viam Conversas
  const podeChatGrupo = has("chat_grupo") || !acesso;

  return {
    loading,
    lojaNome,
    codEmpresa,
    tipoUsuario,
    isLoja: podeMenuLoja, // compat
    acessoTotal,
    podeMenuLoja,
    podeSupervisao,
    podeChat1a1,
    podeChatGrupo,
  };
}
