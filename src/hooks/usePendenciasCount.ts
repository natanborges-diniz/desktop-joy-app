import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

/**
 * Conta notificações não lidas (lida=false) do usuário atual.
 * Atualiza em realtime via Supabase.
 */
export function usePendenciasCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let active = true;

    async function refresh() {
      const { count: c } = await supabase
        .from("notificacoes")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", user!.id)
        .eq("lida", false);
      if (active) setCount(c ?? 0);
    }

    void refresh();

    const channel = supabase
      .channel(`pendencias-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
          filter: `usuario_id=eq.${user.id}`,
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return count;
}
