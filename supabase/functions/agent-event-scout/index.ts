// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildOpportunityFromNormalized,
  computeTrustScore,
  normalizeSourceRecord,
} from "../_shared/agent_pipeline.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function upsertRows(client: ReturnType<typeof createClient>, table: string, rows: any[], onConflict: string) {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict }).select();
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (internalSecret && req.headers.get("x-internal-secret") !== internalSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const source = String(body.source ?? "").toLowerCase();
    const records = Array.isArray(body.records) ? body.records : [];
    const defaults = typeof body.defaults === "object" && body.defaults ? body.defaults : {};
    const runKey = String(body.run_key ?? `${source}:${Date.now()}`);
    const city = typeof body.city === "string" ? body.city : null;

    if (!source) return jsonResponse({ ok: false, error: "Missing source" }, 400);
    if (records.length === 0) {
      return jsonResponse({ ok: false, error: "No records provided" }, 400);
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await client.from("agent_ingestion_runs").upsert({
      run_key: runKey,
      source,
      city,
      status: "running",
      records_received: records.length,
      metadata: {
        defaults,
      },
    }, { onConflict: "run_key" });

    const normalizedRows = [];
    const trustRows = [];
    const rejected = [];
    const opportunityRows = [];
    for (const raw of records) {
      try {
        const normalized = normalizeSourceRecord(source, raw, defaults);
        if (!normalized) {
          rejected.push({ reason: "not_normalizable", raw });
          continue;
        }

        const externalRecord = {
          kind: normalized.kind,
          source,
          source_record_id: normalized.source_record_id,
          ingestion_run_key: runKey,
          source_updated_at: raw.updated_at ?? raw.modified_at ?? null,
          payload: raw,
          normalized_snapshot: normalized,
        };

        const { data: insertedExternal, error: externalError } = await client
          .from("agent_external_records")
          .upsert(externalRecord, { onConflict: "source,source_record_id" })
          .select("id, source, source_record_id, normalized_snapshot")
          .single();

        if (externalError || !insertedExternal) throw externalError ?? new Error("external_upsert_failed");

        normalizedRows.push(insertedExternal);

        const trust = computeTrustScore(source, normalized);
        const trustRow = {
          external_record_id: insertedExternal.id,
          scoring_version: "rules-v1",
          ...trust,
          evidence: {
            ...trust.evidence,
            source,
          },
        };

        const { data: insertedTrust, error: trustError } = await client
          .from("agent_trust_scores")
          .upsert(trustRow, { onConflict: "external_record_id" })
          .select("id")
          .single();
        if (trustError || !insertedTrust) throw trustError ?? new Error("trust_upsert_failed");
        trustRows.push(insertedTrust);

        const opportunity = buildOpportunityFromNormalized(
          normalized,
          insertedExternal.id,
        );
        const { data: insertedOpportunity, error: opportunityError } = await client
          .from("agent_opportunities")
          .upsert(opportunity, { onConflict: "canonical_key" })
          .select("id")
          .single();
        if (opportunityError || !insertedOpportunity) throw opportunityError ?? new Error("opportunity_upsert_failed");
        opportunityRows.push(insertedOpportunity);

      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message?: unknown }).message ?? "unknown_error")
              : JSON.stringify(error);
        rejected.push({
          reason,
          raw,
        });
      }
    }

    await client
      .from("agent_ingestion_runs")
      .update({
        status: rejected.length > 0 ? "completed_with_rejections" : "completed",
        records_normalized: normalizedRows.length,
        records_rejected: rejected.length,
        opportunities_upserted: opportunityRows.length,
        completed_at: new Date().toISOString(),
        metadata: {
          rejected_preview: rejected.slice(0, 20),
        },
      })
      .eq("run_key", runKey);

    return jsonResponse({
      ok: true,
      source,
      run_key: runKey,
      received: records.length,
      normalized: normalizedRows.length,
      rejected: rejected.length,
      opportunities_upserted: opportunityRows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
