import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Missing authorization");

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = authHeader.slice(7);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Invalid session");

    const { data: adminRow } = await admin.from("admin_users").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!adminRow) return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return new Response(JSON.stringify({ error: "Neplatný e-mail." }), { status: 400, headers: corsHeaders });

    const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const existingUser = usersPage.users.find((u) => String(u.email || "").toLowerCase() === email);

    if (existingUser) {
      const { data: existingAdmin } = await admin.from("admin_users").select("user_id").eq("user_id", existingUser.id).maybeSingle();
      if (existingAdmin) {
        return new Response(JSON.stringify({ error: "Tento e-mail už administrátorský přístup má." }), { status: 409, headers: corsHeaders });
      }
      const { data: pending } = await admin.from("admin_invites")
        .select("id,expires_at,cancelled_at,claimed_at")
        .eq("invited_user_id", existingUser.id)
        .is("claimed_at", null)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending && new Date(pending.expires_at).getTime() > Date.now()) {
        return new Response(JSON.stringify({ error: "Na tento e-mail už byla odeslána platná pozvánka." }), { status: 409, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: "Tento e-mail už má účet v systému. Prozatím jej nelze znovu pozvat automaticky." }), { status: 409, headers: corsHeaders });
    }

    const redirectTo = "https://hulinskylukas1-bot.github.io/Questplore/admin/?adminInvite=1";
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteError) throw inviteError;
    if (!invited?.user?.id) throw new Error("Invite did not return a user");

    const { error: dbError } = await admin.from("admin_invites").insert({
      email,
      invited_user_id: invited.user.id,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (dbError) throw dbError;

    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 400, headers: corsHeaders });
  }
});
