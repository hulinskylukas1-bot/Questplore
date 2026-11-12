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

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.session_token || "");
    const deviceToken = String(body?.device_token || "");
    const evidenceId = String(body?.evidence_id || "");

    if (!sessionToken || !deviceToken || !evidenceId) {
      return json({ error: "MISSING_FIELDS" }, 400);
    }

    const { data: gameSession, error: sessionError } = await admin
      .from("game_sessions")
      .select("id,status")
      .eq("session_token", sessionToken)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!gameSession || !["active","completed"].includes(gameSession.status)) {
      return json({ error: "INVALID_SESSION" }, 403);
    }

    const { data: device, error: deviceError } = await admin
      .from("session_devices")
      .select("id")
      .eq("session_id", gameSession.id)
      .eq("device_token", deviceToken)
      .maybeSingle();
    if (deviceError) throw deviceError;
    if (!device) return json({ error: "INVALID_DEVICE" }, 403);

    const { data: evidence, error: evidenceError } = await admin
      .from("evidence")
      .select("id,session_id,evidence_type,storage_path,metadata,created_at")
      .eq("id", evidenceId)
      .eq("session_id", gameSession.id)
      .maybeSingle();
    if (evidenceError) throw evidenceError;
    if (!evidence) return json({ error: "EVIDENCE_NOT_FOUND" }, 404);
    if (evidence.evidence_type !== "photo" || !evidence.storage_path) {
      return json({ error: "NOT_PHOTO_EVIDENCE" }, 400);
    }

    const { data: signed, error: signError } = await admin.storage
      .from("game-evidence")
      .createSignedUrl(evidence.storage_path, 300);
    if (signError) throw signError;

    return json({
      ok: true,
      evidence_id: evidence.id,
      signed_url: signed.signedUrl,
      expires_in: 300,
      metadata: evidence.metadata,
      created_at: evidence.created_at,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "SIGNED_URL_FAILED", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
