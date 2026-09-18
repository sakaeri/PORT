import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { consumeReferralCreditOnExistingSubscription, getStripe } from "@/lib/stripe";
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
    const newStatus = mapStripeStatus(subscription.status);

    const { data: org } = await admin.from("organizations").select("id, plan_status").eq("stripe_subscription_id", subscription.id).maybeSingle();
    if (org) {
      const { error } = await admin.from("organizations").update({ plan_status: newStatus }).eq("id", org.id);
      if (error) console.error("stripe-webhook: failed to update plan_status", error);

      // 紹介経由で申し込んだ事業者が初めて課金有効になったタイミングで、
      // 紹介元のチケットを pending → confirmed にする（紹介者への還元の判定用）。
      if (newStatus === "active" && org.plan_status !== "active") {
        const { data: credit, error: creditError } = await admin
          .from("referral_credits")
          .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
          .eq("referred_org_id", org.id)
          .eq("status", "pending")
          .select("referrer_org_id")
          .maybeSingle();
        if (creditError) console.error("stripe-webhook: failed to confirm referral credit", creditError);

        // 紹介元がすでに課金中（サブスクリプションを持っている）なら、
        // このタイミングで1ヶ月無料クーポンをすぐ適用する。まだ課金開始前
        // （トライアル中）なら、後で startSubscriptionSetup 側が適用する。
        if (credit?.referrer_org_id) {
          const { data: referrerOrg } = await admin
            .from("organizations")
            .select("stripe_subscription_id")
            .eq("id", credit.referrer_org_id)
            .maybeSingle();
          if (referrerOrg?.stripe_subscription_id) {
            await consumeReferralCreditOnExistingSubscription(admin, stripe, credit.referrer_org_id, referrerOrg.stripe_subscription_id);
          }
        }
      }
    }
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
