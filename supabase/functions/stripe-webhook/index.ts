// @ts-nocheck
import Stripe from "npm:stripe@14.25.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

function isPremiumStatus(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

function toIso(ts: number | null | undefined) {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

async function upsertSubscription(admin: ReturnType<typeof createClient>, payload: {
  userId: string;
  customerId?: string | null;
  subscriptionId: string;
  priceId?: string | null;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await admin
    .from("billing_subscriptions")
    .upsert(
      {
        user_id: payload.userId,
        provider: "stripe",
        provider_customer_id: payload.customerId ?? null,
        provider_subscription_id: payload.subscriptionId,
        provider_price_id: payload.priceId ?? null,
        status: payload.status,
        current_period_start: payload.currentPeriodStart ?? null,
        current_period_end: payload.currentPeriodEnd ?? null,
        cancel_at_period_end: payload.cancelAtPeriodEnd ?? false,
        canceled_at: payload.canceledAt ?? null,
        metadata: payload.metadata ?? {},
      },
      { onConflict: "provider_subscription_id" },
    );

  await admin
    .from("profiles")
    .update({
      is_premium: isPremiumStatus(payload.status),
      stripe_customer_id: payload.customerId ?? undefined,
    })
    .eq("user_id", payload.userId);
}

async function resolveUserId(
  admin: ReturnType<typeof createClient>,
  candidateUserId: string | null | undefined,
  subscriptionId: string,
): Promise<string | null> {
  if (candidateUserId) return candidateUserId;

  const { data } = await admin
    .from("billing_subscriptions")
    .select("user_id")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();

  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response(JSON.stringify({ ok: false, error: "Missing stripe signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        (session.metadata?.user_id as string | undefined)
        || (session.client_reference_id as string | undefined)
        || null;

      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      if (userId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const firstItem = subscription.items.data[0];
        await upsertSubscription(admin, {
          userId,
          customerId: typeof subscription.customer === "string" ? subscription.customer : null,
          subscriptionId: subscription.id,
          priceId: firstItem?.price?.id ?? null,
          status: subscription.status,
          currentPeriodStart: toIso(subscription.current_period_start),
          currentPeriodEnd: toIso(subscription.current_period_end),
          cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
          canceledAt: toIso(subscription.canceled_at),
          metadata: subscription.metadata,
        });
      }
    }

    if (
      event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const metadataUser = (sub.metadata?.user_id as string | undefined) ?? null;
      const userId = await resolveUserId(admin, metadataUser, sub.id);

      if (userId) {
        const firstItem = sub.items.data[0];
        await upsertSubscription(admin, {
          userId,
          customerId: typeof sub.customer === "string" ? sub.customer : null,
          subscriptionId: sub.id,
          priceId: firstItem?.price?.id ?? null,
          status: sub.status,
          currentPeriodStart: toIso(sub.current_period_start),
          currentPeriodEnd: toIso(sub.current_period_end),
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          canceledAt: toIso(sub.canceled_at),
          metadata: sub.metadata,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
