// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method not allowed" });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { ok: false, error: "Missing Authorization header" });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json(401, { ok: false, error: "Unauthorized" });
    }
    const userId = userData.user.id;

    const nowIso = new Date().toISOString();
    const restoreUntilIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        deleted_at: nowIso,
        deletion_requested_at: nowIso,
        deletion_restore_until: restoreUntilIso,
        is_open_to_connections: false,
      })
      .eq("user_id", userId);
    if (profileError) {
      return json(500, { ok: false, error: profileError.message });
    }

    // Safety: globally turn off openness signals for this user in all groups.
    await admin
      .from("group_memberships")
      .update({ is_open_to_connect: false, openness_set_at: null })
      .eq("user_id", userId);

    // Close active/pending introductions for privacy.
    await admin
      .from("connections")
      .update({ status: "closed" })
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .in("status", ["pending", "accepted"]);

    return json(200, { ok: true, soft_deleted: true, restore_until: restoreUntilIso });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
