/**
 * Supabase Edge Function: delete-account
 *
 * Self-serve account + data deletion (fulfils the "request deletion" promise in
 * the disclaimer / privacy terms). A signed-in user calls this with their own
 * access token; the function verifies the JWT, then deletes THAT user from
 * auth.users using the service role. Every user-owned table
 * (profiles, submissions, leagues, league_members) has
 * `on delete cascade` from auth.users, so the user's data is removed
 * automatically; terms_acceptances rows are anonymised (user_id → null).
 *
 * A user can only ever delete themselves — the id comes from the verified token,
 * never from the request body.
 *
 * Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Deploy: supabase functions deploy delete-account   (keep JWT verification ON)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing access token" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Resolve the caller from their token — they can only delete themselves.
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "invalid or expired session" }, 401);

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true, deleted: user.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
