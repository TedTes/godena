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

    // Cleanup profile media paths in storage.
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url, photo_urls")
      .eq("user_id", userId)
      .maybeSingle();
    const paths = Array.from(
      new Set([
        ...(profile?.avatar_url ? [profile.avatar_url] : []),
        ...((profile?.photo_urls as string[] | null) ?? []),
      ].filter(Boolean)),
    );
    if (paths.length > 0) {
      await admin.storage.from("profile-photos").remove(paths);
    }

    // Delete rows that can block auth user deletion due RESTRICT constraints.
    const { data: createdGroups } = await admin.from("groups").select("id").eq("created_by", userId);
    const createdGroupIds = (createdGroups ?? []).map((g) => g.id);

    if (createdGroupIds.length > 0) {
      await admin.from("connections").delete().in("group_id", createdGroupIds);
      await admin.from("group_events").delete().in("group_id", createdGroupIds);
      await admin.from("groups").delete().in("id", createdGroupIds);
    }

    await admin
      .from("connections")
      .delete()
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

    await admin.from("group_events").delete().eq("created_by", userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json(500, { ok: false, error: deleteError.message });
    }

    return json(200, { ok: true });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
