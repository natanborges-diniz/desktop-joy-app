import { useEffect, useRef } from "react";
import { showLocalNotification } from "@/lib/localNotify";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Enquanto houver pendências (count > 0), dispara um lembrete local a cada 15min.
 * Suprime se o usuário já estiver em /notificacoes (aba visível).
 */
export function usePendenciasReminder(count: number): void {
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    const id = window.setInterval(() => {
      const n = countRef.current;
      if (n <= 0) return;
      void showLocalNotification({
        title: `Você tem ${n} aviso${n > 1 ? "s" : ""} pendente${n > 1 ? "s" : ""}`,
        body: "Toque para resolver agora.",
        url: "/notificacoes",
        tag: "pendencias-reminder",
        suppressWhenOnPathPrefixes: ["/notificacoes"],
      });
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
}
