import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/auth-context";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Singleton de presença global. Evita múltiplos `.subscribe()` no mesmo canal
 * (que causam o erro "cannot add `presence` callbacks ... after subscribe()").
 * Vários componentes podem se inscrever via listeners; o canal real é único.
 */
let channel: RealtimeChannel | null = null;
let currentUserId: string | null = null;
let onlineIds: Set<string> = new Set();
const listeners = new Set<(ids: Set<string>) => void>();

function emit() {
  for (const l of listeners) l(onlineIds);
}

function ensureChannel(userId: string) {
  if (channel && currentUserId === userId) return;
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  currentUserId = userId;
  const ch = supabase.channel("presence:global", {
    config: { presence: { key: userId } },
  });
  ch.on("presence", { event: "sync" }, () => {
    onlineIds = new Set(Object.keys(ch.presenceState()));
    emit();
  }).subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await ch.track({ online_at: new Date().toISOString() });
    }
  });
  channel = ch;
}

export function usePresence() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(onlineIds);

  useEffect(() => {
    if (!user) return;
    ensureChannel(user.id);
    const listener = (next: Set<string>) => setIds(next);
    listeners.add(listener);
    setIds(onlineIds);
    return () => {
      listeners.delete(listener);
      // Não removemos o canal: outros componentes podem estar usando.
    };
  }, [user]);

  return ids;
}
