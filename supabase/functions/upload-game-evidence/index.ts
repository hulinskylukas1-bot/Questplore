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

    const form = await req.formData();
    const sessionToken = String(form.get("session_token") || "");
    const deviceToken = String(form.get("device_token") || "");
    const stageId = String(form.get("stage_id") || "");
    const blockId = String(form.get("block_id") || "");
    const file = form.get("file");

    if (!sessionToken || !deviceToken || !stageId || !blockId || !(file instanceof File)) {
      return json({ error: "MISSING_FIELDS" }, 400);
    }
    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      return json({ error: "FILE_SIZE", max_mb: 15 }, 400);
    }

    const mime = (file.type || "").toLowerCase();
    const allowed = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
    if (!allowed.has(mime)) return json({ error: "FILE_TYPE", mime_type: mime }, 400);

    const { data: gameSession, error: sessionError } = await admin
      .from("game_sessions")
      .select("id, game_version_id, status")
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

    const { data: block, error: blockError } = await admin
      .from("blocks")
      .select("id, stage_id, block_type")
      .eq("id", blockId)
      .maybeSingle();
    if (blockError) throw blockError;
    if (!block || block.stage_id !== stageId || block.block_type !== "photo") {
      return json({ error: "INVALID_BLOCK" }, 400);
    }

    const { data: stage, error: stageError } = await admin
      .from("stages")
      .select("id, game_version_id")
      .eq("id", stageId)
      .maybeSingle();
    if (stageError) throw stageError;
    if (!stage || stage.game_version_id !== gameSession.game_version_id) {
      return json({ error: "WRONG_GAME_VERSION" }, 400);
    }

    const extByMime: Record<string,string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "image/heif": "heif",
    };
    const ext = extByMime[mime] || "bin";
    const objectPath = `${gameSession.id}/${stageId}/${blockId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { data: uploaded, error: uploadError } = await admin.storage
      .from("game-evidence")
      .upload(objectPath, file, {
        contentType: mime,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: evidence, error: evidenceError } = await admin
      .from("evidence")
      .insert({
        session_id: gameSession.id,
        stage_id: stageId,
        block_id: blockId,
        evidence_type: "photo",
        storage_path: uploaded.path,
        metadata: {
          original_name: file.name,
          size_bytes: file.size,
          mime_type: mime,
          device_id: device.id,
          captured_at: new Date().toISOString(),
        },
      })
      .select("id, storage_path, created_at")
      .single();
    if (evidenceError) {
      await admin.storage.from("game-evidence").remove([uploaded.path]);
      throw evidenceError;
    }

    return json({
      ok: true,
      evidence_id: evidence.id,
      storage_path: evidence.storage_path,
      file_name: file.name,
      created_at: evidence.created_at,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "UPLOAD_FAILED", message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
