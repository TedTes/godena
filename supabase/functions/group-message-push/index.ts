// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PushRequest = {
  group_id: string;
  message_id: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const senderId = authData.user.id;
    const body = (await req.json()) as PushRequest;
    if (!body.group_id || !body.message_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    const { data: messageRow, error: messageError } = await client
      .from("group_messages")
      .select("id, group_id, sender_id, content")
      .eq("id", body.message_id)
      .eq("group_id", body.group_id)
      .maybeSingle();

    if (messageError || !messageRow || messageRow.sender_id !== senderId) {
      return new Response(JSON.stringify({ error: "Invalid message context" }), { status: 403 });
    }

    const [{ data: groupRow }, { data: senderProfile }, { data: recipients }] = await Promise.all([
      client.from("groups").select("name").eq("id", body.group_id).maybeSingle(),
      client.from("profiles").select("full_name").eq("user_id", senderId).maybeSingle(),
      client
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", body.group_id)
        .neq("user_id", senderId),
    ]);

    const recipientIds = (recipients ?? []).map((r) => r.user_id);
    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { data: prefRows } = await client
      .from("profiles")
      .select("user_id, notify_group_messages")
      .in("user_id", recipientIds);
    const prefMap = new Map<string, boolean | null>();
    for (const row of ((prefRows ?? []) as Array<{ user_id: string; notify_group_messages: boolean | null }>)) {
      prefMap.set(row.user_id, row.notify_group_messages);
    }
    const allowedRecipientIds = recipientIds.filter((uid) => prefMap.get(uid) !== false);
    if (allowedRecipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "disabled_by_preferences" }), { status: 200 });
    }

    const { data: tokenRows } = await client
      .from("user_push_tokens")
      .select("expo_push_token")
      .eq("is_active", true)
      .in("user_id", allowedRecipientIds);

    const tokens = Array.from(new Set((tokenRows ?? []).map((r) => r.expo_push_token))).filter(Boolean);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const title = groupRow?.name ? `${groupRow.name}` : "New group message";
    const senderName = senderProfile?.full_name || "Someone";
    const preview = messageRow.content.length > 120
      ? `${messageRow.content.slice(0, 117)}...`
      : messageRow.content;
    const bodyText = `${senderName}: ${preview}`;

    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title,
      body: bodyText,
      data: { type: "group_message", group_id: body.group_id, message_id: body.message_id },
    }));

    const expoResp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResp.json().catch(() => ({}));

    return new Response(
      JSON.stringify({ sent: tokens.length, expo_status: expoResp.status, expo: expoJson }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
