import { useCallback, useEffect, useState } from "react";
import { getPermission, isPushSupported, isSubscribed, subscribePush } from "@/lib/push";

export type PushState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean | null; // null = ainda checando
  loading: boolean;
  subscribe: () => Promise<{ ok: boolean; reason?: string }>;
  refresh: () => Promise<void>;
};

/** Estado consolidado da subscription Web Push para o usuário atual. */
export function usePushSubscription(): PushState {
  const [supported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (isPushSupported() ? getPermission() : "unsupported"),
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setSubscribed(false);
      return;
    }
    setPermission(getPermission());
    const ok = await isSubscribed();
    setSubscribed(ok);
  }, []);

  useEffect(() => {
    void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await subscribePush();
      await refresh();
      return res;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return { supported, permission, subscribed, loading, subscribe, refresh };
}
