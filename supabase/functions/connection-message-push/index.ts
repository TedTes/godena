// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PushRequest = {
  connection_id: string;
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
    if (!body.connection_id || !body.message_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    const { data: messageRow, error: messageError } = await client
      .from("connection_messages")
      .select("id, connection_id, sender_id, content")
      .eq("id", body.message_id)
      .eq("connection_id", body.connection_id)
      .maybeSingle();

    if (messageError || !messageRow || messageRow.sender_id !== senderId) {
      return new Response(JSON.stringify({ error: "Invalid message context" }), { status: 403 });
    }

    const { data: connectionRow, error: connectionError } = await client
      .from("connections")
      .select("id, user_a_id, user_b_id, status")
      .eq("id", body.connection_id)
      .maybeSingle();

    if (connectionError || !connectionRow) {
      return new Response(JSON.stringify({ error: "Connection not found" }), { status: 404 });
    }
    if (connectionRow.status !== "accepted") {
      return new Response(JSON.stringify({ sent: 0, reason: "connection_not_accepted" }), { status: 200 });
    }

    const recipientId =
      connectionRow.user_a_id === senderId ? connectionRow.user_b_id
      : connectionRow.user_b_id === senderId ? connectionRow.user_a_id
      : null;

    if (!recipientId) {
      return new Response(JSON.stringify({ error: "Sender not in connection" }), { status: 403 });
    }

    const [{ data: senderProfile }, { data: prefRow }] = await Promise.all([
      client.from("profiles").select("full_name").eq("user_id", senderId).maybeSingle(),
      client
        .from("profiles")
        .select("notify_connection_messages")
        .eq("user_id", recipientId)
        .maybeSingle(),
    ]);

    if (prefRow && prefRow.notify_connection_messages === false) {
      return new Response(JSON.stringify({ sent: 0, reason: "disabled_by_preferences" }), { status: 200 });
    }

    const { data: tokenRows } = await client
      .from("user_push_tokens")
      .select("expo_push_token")
      .eq("is_active", true)
      .eq("user_id", recipientId);

    const tokens = Array.from(new Set((tokenRows ?? []).map((r) => r.expo_push_token))).filter(Boolean);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const senderName = senderProfile?.full_name || "Someone";
    const preview = messageRow.content.length > 120
      ? `${messageRow.content.slice(0, 117)}...`
      : messageRow.content;
    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title: senderName,
      body: preview,
      data: {
        type: "connection_message",
        connection_id: body.connection_id,
        message_id: body.message_id,
      },
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
