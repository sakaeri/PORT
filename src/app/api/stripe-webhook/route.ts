import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";

// チャージの決済完了をStripeから受け取り、残高に反映する。
// checkout.session.id をトランザクションに記録しておき、同じセッションを
// 二重に処理しないようにする（Stripeはイベントを複数回送ることがある）。
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.mode === "setup" && session.setup_intent) {
      const customerId = session.metadata?.customer_id;
      const threshold = Number(session.metadata?.auto_recharge_threshold);
      const amount = Number(session.metadata?.auto_recharge_amount);
      if (customerId && threshold > 0 && amount > 0) {
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string);
        const paymentMethodId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : (setupIntent.payment_method?.id ?? null);
        const stripeCustomerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
        if (paymentMethodId && stripeCustomerId) {
          await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } }).catch((e) => {
            console.error("stripe-webhook: failed to set default payment method", e);
          });
          const admin = createServiceRoleClient();
          const { error } = await admin
            .from("customers")
            .update({
              stripe_customer_id: stripeCustomerId,
              stripe_payment_method_id: paymentMethodId,
              auto_recharge_enabled: true,
              auto_recharge_threshold: threshold,
              auto_recharge_amount: amount,
              auto_recharge_fail_count: 0,
            })
            .eq("id", customerId);
          if (error) console.error("stripe-webhook: failed to save auto-recharge setup", error);
        }
      }
    }

    if (session.mode === "payment" && session.payment_status === "paid") {
      const customerId = session.metadata?.customer_id;
      const orgId = session.metadata?.org_id;
      const amount = session.amount_total;
      if (customerId && orgId && amount) {
        const admin = createServiceRoleClient();
        const { data: existing } = await admin
          .from("customer_balance_transactions")
          .select("id")
          .eq("stripe_checkout_session_id", session.id)
          .maybeSingle();
        if (!existing) {
          const { error: txError } = await admin.from("customer_balance_transactions").insert({
            customer_id: customerId,
            org_id: orgId,
            amount,
            kind: "charge",
            stripe_checkout_session_id: session.id,
          });
          if (txError) {
            console.error("stripe-webhook: failed to record charge transaction", txError);
          } else {
            // customer.balance をここで読んでから足して書き戻すと、ほぼ同時に
            // 届いた別の引き落とし・入金と競合して片方が消えることがあるため、
            // DB側で加算させる（読み出さずに書く）。
            const { error: balError } = await admin.rpc("increment_customer_balance", { p_customer_id: customerId, p_amount: amount });
            if (balError) console.error("stripe-webhook: failed to update balance", balError);
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
