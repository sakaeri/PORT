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
    if (session.payment_status === "paid") {
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
            const { data: customer } = await admin.from("customers").select("balance").eq("id", customerId).maybeSingle();
            const { error: balError } = await admin
              .from("customers")
              .update({ balance: (customer?.balance ?? 0) + amount })
              .eq("id", customerId);
            if (balError) console.error("stripe-webhook: failed to update balance", balError);
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
