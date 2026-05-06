import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import { showLocalNotification } from "@/lib/localNotify";

type NotifRow = {
  id: string;
  user_id: string;
  titulo: string | null;
  mensagem: string | null;
};

/**
 * Sub Realtime em `notificacoes` para o usuário atual.
 * Quando chega uma nova linha:
 * - emite `showLocalNotification` (suprimida se a aba estiver em /notificacoes visível).
 * Útil mesmo quando o push do servidor ainda não está configurado, para feedback
 * imediato com app aberto em outra aba/tela.
 */
export function useNotificacoesRealtime(): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notificacoes-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes",
          filter: `usuario_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotifRow;
          void showLocalNotification({
            title: row.titulo ?? "Novo aviso",
            body: row.mensagem ?? "",
            url: "/notificacoes",
            tag: `notif-${row.id}`,
            suppressWhenOnPathPrefixes: ["/notificacoes"],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);
}
