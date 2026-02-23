// @ts-nocheck
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

async function callFunction(name: string, internalSecret?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(internalSecret ? { "x-internal-secret": internalSecret } : {}),
    },
    body: JSON.stringify({}),
  });

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (internalSecret) {
      const provided = req.headers.get("x-internal-secret");
      if (provided !== internalSecret) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
      }
    }

    const mutual = await callFunction("mutual-detection", internalSecret);
    if (!mutual.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          step: "mutual-detection",
          status: mutual.status,
          response: mutual.body,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const trigger = await callFunction("reveal-trigger", internalSecret);
    if (!trigger.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          step: "reveal-trigger",
          status: trigger.status,
          response: trigger.body,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        pipeline: "mutual-detection -> reveal-trigger",
        mutual_detection: mutual.body,
        reveal_trigger: trigger.body,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
