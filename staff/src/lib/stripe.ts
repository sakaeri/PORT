import "server-only";
import Stripe from "stripe";
import type { createServiceRoleClient } from "@/lib/supabase/server";

// STRIPE_SECRET_KEY が未設定の間はここで呼び出し元にエラーを返す
// （import時点で例外を投げるとビルド自体が壊れるため、使う側で遅延させる）。
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("決済機能の準備ができていません。しばらくしてから再度お試しください。");
  return new Stripe(key);
}

// 紹介した事業者への1ヶ月無料特典用の共通クーポン（100%オフ・次回請求のみ）。
// 固定IDで get-or-create するので、Stripe側で事前に作っておく必要はない。
const REFERRAL_COUPON_ID = "referral-1-month-free";

export async function getOrCreateReferralCoupon(stripe: Stripe): Promise<string> {
  try {
    await stripe.coupons.retrieve(REFERRAL_COUPON_ID);
  } catch {
    await stripe.coupons.create({ id: REFERRAL_COUPON_ID, name: "紹介1ヶ月無料", percent_off: 100, duration: "once" });
  }
  return REFERRAL_COUPON_ID;
}

// この事業者（紹介した側）に確定済み・未使用の紹介チケットが残っていれば
// 最も古い1件を返す。無ければ null。実際に使う（クーポンを適用する）のは
// 呼び出し側で、消費の記録は markReferralCreditConsumed で別途行う
// （サブスクリプション作成前にクーポンを組み込みたい呼び出し元と、
// 既存のサブスクリプションを後から更新したい呼び出し元の両方があるため）。
export async function pickAvailableReferralCredit(admin: ReturnType<typeof createServiceRoleClient>, referrerOrgId: string) {
  const { data } = await admin
    .from("referral_credits")
    .select("id")
    .eq("referrer_org_id", referrerOrgId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function markReferralCreditConsumed(admin: ReturnType<typeof createServiceRoleClient>, creditId: string) {
  const billingMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  await admin.from("referral_credits").update({ status: "consumed", consumed_billing_month: billingMonth }).eq("id", creditId);
}

// 既に存在するサブスクリプション（既に有効に課金中の事業者が、後から
// 紹介チケットを獲得したケース）に1ヶ月無料クーポンを適用して消費する。
// これから新しくサブスクリプションを作る場合は、作成時に直接
// coupon を渡す方（下記 startSubscriptionSetup 側）を使うこと
// — 作成後の update だと初回請求にはもう間に合わないため。
export async function consumeReferralCreditOnExistingSubscription(
  admin: ReturnType<typeof createServiceRoleClient>,
  stripe: Stripe,
  referrerOrgId: string,
  subscriptionId: string,
) {
  const creditId = await pickAvailableReferralCredit(admin, referrerOrgId);
  if (!creditId) return;
  const couponId = await getOrCreateReferralCoupon(stripe);
  await stripe.subscriptions.update(subscriptionId, { discounts: [{ coupon: couponId }] });
  await markReferralCreditConsumed(admin, creditId);
}
