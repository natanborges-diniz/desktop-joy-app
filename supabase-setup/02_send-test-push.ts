// supabase/functions/send-test-push/index.ts
// Cole no painel Supabase: Edge Functions → New Function → "send-test-push"
// e adicione os secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//
// Esta function envia uma notificação de teste para todas as assinaturas
// do usuário autenticado que a chamou.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@infoco.com.br";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Identifica o usuário pela JWT do header Authorization
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Busca todas as subs do usuário (com service_role para bypass de RLS)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: subs, error: subErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ error: "no subscriptions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title: "🔔 Notificações ativadas!",
      body: "Você receberá avisos do Infoco Messenger neste dispositivo.",
      url: "/",
      tag: "test-push",
    });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ),
      ),
    );

    // Limpa subs inválidas (410 Gone / 404)
    const toDelete: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const err = r.reason as { statusCode?: number; message?: string };
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          toDelete.push(subs[i].id);
        } else {
          console.error("[push] erro:", err?.statusCode, err?.message);
        }
      }
    });
    if (toDelete.length) {
      await admin.from("push_subscriptions").delete().in("id", toDelete);
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(
      JSON.stringify({ sent, total: subs.length, cleaned: toDelete.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-test-push] erro:", e);
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
