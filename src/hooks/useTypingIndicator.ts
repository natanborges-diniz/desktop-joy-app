import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { makeConversaId } from "@/lib/conversa";

/**
 * Indicador "digitando…" entre dois usuários, via Broadcast.
 * - sendTyping(): chame quando o usuário digita (debounced internamente).
 * - otherTyping: true se o outro usuário está digitando agora (expira em 3s).
 */
export function useTypingIndicator(selfId: string | undefined, otherId: string | undefined) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef(0);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selfId || !otherId) return;
    const id = makeConversaId(selfId, otherId);
    const channel = supabase.channel(`typing:${id}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "typing" }, (payload) => {
        if ((payload.payload as { from?: string })?.from === otherId) {
          setOtherTyping(true);
          if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
          expireTimerRef.current = setTimeout(() => setOtherTyping(false), 3000);
        }
      })
      .subscribe();

    return () => {
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [selfId, otherId]);

  function sendTyping() {
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // throttle
    lastSentRef.current = now;
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: selfId },
    });
  }

  return { otherTyping, sendTyping };
}
