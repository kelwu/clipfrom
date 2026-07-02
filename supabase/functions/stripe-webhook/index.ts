import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency guard — check if we've already processed this event ID
  const { data: existing } = await supabase
    .from("processed_stripe_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existing) {
    console.log(`Event ${event.id} already processed — skipping`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id;
      const credits = parseInt(session.metadata?.credits ?? "0", 10);
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

      if (userId && credits > 0) {
        // Atomic increment — no SELECT + UPDATE race condition
        const { data: newBalance } = await supabase.rpc("add_credits", { uid: userId, amount: credits });
        // Persist Stripe IDs for billing portal / subscription management
        await supabase.from("user_profiles").upsert({
          id: userId,
          ...(customerId ? { stripe_customer_id: customerId } : {}),
          ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
          updated_at: new Date().toISOString(),
        }, { onConflict: "id", ignoreDuplicates: false });
        console.log(`checkout.session.completed: +${credits} credits for user ${userId} → balance ${newBalance}`);
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;

      // The first invoice is already handled by checkout.session.completed
      if (invoice.billing_reason === "subscription_create") {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscriptionId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (!subscriptionId) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.user_id;
      const credits = parseInt(subscription.metadata?.credits ?? "0", 10);

      if (userId && credits > 0) {
        const { data: newBalance } = await supabase.rpc("add_credits", { uid: userId, amount: credits });
        console.log(`invoice.payment_succeeded: +${credits} credits for user ${userId} → balance ${newBalance}`);
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Do NOT record the event — let Stripe retry and we'll process it next time
    return new Response("Handler error", { status: 500 });
  }

  // Mark as processed only after successful handling so a retry can re-run on transient failure
  const { error: insertErr } = await supabase
    .from("processed_stripe_events")
    .insert({ event_id: event.id });
  if (insertErr && insertErr.code !== "23505") {
    console.error("Could not record processed event:", insertErr);
    // Non-fatal: credits were granted, idempotency record is best-effort
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
