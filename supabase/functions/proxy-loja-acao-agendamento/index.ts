import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ATRIUM_URL = "https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1/loja-acao-agendamento";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  function json(p: unknown, s = 200) {
    return new Response(JSON.stringify(p), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: uErr } = await supabase.auth.getUser();
    if (uErr || !userData.user?.email) return json({ error: "Unauthorized" }, 401);

    const secret = Deno.env.get("INTERNAL_SERVICE_SECRET");
    if (!secret) return json({ error: "INTERNAL_SERVICE_SECRET ausente" }, 500);

    const body = await req.json().catch(() => ({}));
    const r = await fetch(ATRIUM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-key": secret,
      },
      body: JSON.stringify({ ...body, user_email: userData.user.email }),
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
