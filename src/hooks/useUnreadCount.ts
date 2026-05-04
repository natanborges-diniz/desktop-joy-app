import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { showLocalNotification } from "@/lib/localNotify";

type MensagemRow = {
  id: string;
  remetente_id: string;
  destinatario_id: string;
  conteudo: string | null;
  lida: boolean | null;
};

/**
 * Conta as mensagens internas com lida=false destinadas ao usuário atual.
 * Atualiza em tempo real via Supabase Realtime.
 *
 * Também emite notificação local (via SW) quando chega uma nova mensagem
 * para mim, suprimindo se eu já estiver vendo aquela conversa.
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
        (payload) => {
          // Atualiza contagem em qualquer change.
          void refresh();

          // Notificação local apenas em INSERT direcionado ao usuário atual.
          if (payload.eventType !== "INSERT") return;
          const row = payload.new as MensagemRow;
          if (!row || row.destinatario_id !== user!.id) return;

          // Buscar nome do remetente para um título melhor.
          void supabase
            .from("profiles")
            .select("nome,email")
            .eq("user_id", row.remetente_id)
            .maybeSingle()
            .then(({ data }) => {
              const nome =
                (data as { nome?: string | null; email?: string | null } | null)?.nome ??
                (data as { nome?: string | null; email?: string | null } | null)?.email ??
                "Nova mensagem";
              const trecho = (row.conteudo ?? "").slice(0, 120);
              void showLocalNotification({
                title: nome,
                body: trecho,
                url: `/conversas/${row.remetente_id}`,
                tag: `msg-${row.remetente_id}`,
                suppressWhenOnPathPrefixes: [`/conversas/${row.remetente_id}`],
              });
            });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return count;
}
