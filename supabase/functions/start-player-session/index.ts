import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const secretJson = Deno.env.get("SUPABASE_SECRET_KEYS");
    const secret = secretJson ? JSON.parse(secretJson).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !secret) return json({ error: "SERVER_CONFIG" }, 500);

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim();
    const deviceToken = String(body?.device_token || "").trim();

    if (!code || !deviceToken) return json({ error: "MISSING_FIELDS" }, 400);

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: session, error: startError } = await admin.rpc("start_or_resume_game", {
      p_code: code,
      p_device_token: deviceToken,
    });

    if (startError) {
      const msg = startError.message || "START_FAILED";
      if (msg.includes("INVALID_GAME_CODE")) return json({ error: "INVALID_GAME_CODE" }, 403);
      if (msg.includes("DEVICE_LIMIT_REACHED")) return json({ error: "DEVICE_LIMIT_REACHED" }, 403);
      throw startError;
    }

    const { data: content, error: contentError } = await admin.rpc("get_session_game_content", {
      p_session_token: session.session_token,
      p_device_token: deviceToken,
      p_locale: "cs",
    });
    if (contentError) throw contentError;
    if (!content?.stages) return json({ error: "GAME_CONTENT_UNAVAILABLE" }, 500);

    return json({ ok: true, session, content });
  } catch (e) {
    console.error(e);
    return json({ error: "START_PLAYER_FAILED", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
