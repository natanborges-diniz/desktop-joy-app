import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";

/**
 * Conta as mensagens internas com lida=false destinadas ao usuário atual.
 * Atualiza em tempo real via Supabase Realtime.
 */
export function useUnreadCount() {
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
        .from("mensagens_internas")
        .select("id", { count: "exact", head: true })
        .eq("destinatario_id", user!.id)
        .eq("lida", false);
      if (active) setCount(c ?? 0);
    }

    void refresh();

    const channel = supabase
      .channel(`unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mensagens_internas" },
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
