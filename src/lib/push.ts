import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

/** Verifica se o navegador suporta Web Push completamente. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Detecta iOS (iPhone/iPad). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

/** PWA está rodando instalada (standalone)? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** No iOS, push só funciona com app instalado na tela inicial (iOS 16.4+). */
export function iosNeedsInstall(): boolean {
  return isIOS() && !isStandalone();
}

export function getPermission(): NotificationPermission {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Já existe assinatura ativa neste navegador? */
export async function isSubscribed(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/** Pede permissão, gera assinatura e salva no banco. Retorna true se sucesso. */
export async function subscribePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "no-vapid-key" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no-sw" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const endpoint = sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return { ok: false, reason: "no-keys" };

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, reason: "no-user" };

  const { error } = await supabase.from("push_subscriptions" as never).upsert(
    {
      user_id: user.user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      last_used_at: new Date().toISOString(),
    } as never,
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push] erro ao salvar subscription:", error);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/** Remove assinatura local e do banco. */
export async function unsubscribePush(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;

  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.from("push_subscriptions" as never).delete().eq("endpoint", endpoint);
  return true;
}

/** Atualiza badge no ícone do app (Android instalado / desktops compatíveis). */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) nav.setAppBadge?.(count);
    else nav.clearAppBadge?.();
  } catch {
    // sem suporte (ex: iOS) — silencioso
  }
}
