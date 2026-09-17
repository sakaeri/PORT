import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Stripeからのサブスクリプション状態変化の通知。stripe_subscription_id で
// 事業者を特定し、organizations.plan_status に反映する。トライアル期間は
// こちら側（trial_ends_on）で管理しているため、Stripe側の trialing は
// 実際には使わない想定だが念のため active 扱いにしておく。
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

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object;
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("organizations")
      .update({ plan_status: mapStripeStatus(subscription.status) })
      .eq("stripe_subscription_id", subscription.id);
    if (error) console.error("stripe-webhook: failed to update plan_status", error);
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: Stripe.Subscription.Status): "trial" | "active" | "past_due" | "paused" | "cancelled" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "paused":
      return "paused";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "past_due";
  }
}
