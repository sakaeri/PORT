import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// 残高の自動チャージの日次バッチ。有効化している依頼主のうち、残高が
// しきい値を下回っている人だけ、保存済みのカードへ off_session で課金する。
// 失敗が3回続いたら、カードが使えない状態が続いていると判断して自動で
// オフにする（毎日同じカードへ課金を試み続けて延々と失敗通知を送らない
// ようにするため）。この定期対応（recurring-subscriptions）のバッチより
// 前の時間帯に走らせ、定期対応の引き落としまでに残高を補充しておく。
const MAX_FAILURES = 3;

async function notifyCustomer(admin: ReturnType<typeof createServiceRoleClient>, customerId: string, body: string) {
  const { data: thread } = await admin.from("threads").select("id").eq("customer_id", customerId).eq("kind", "customer").maybeSingle();
  if (!thread) return;
  await admin.from("messages").insert({ thread_id: thread.id, sender_id: null, sender_role: null, kind: "notice", body });
  await admin.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", thread.id);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: candidates, error } = await admin
    .from("customers")
    .select("id, org_id, balance, stripe_customer_id, stripe_payment_method_id, auto_recharge_threshold, auto_recharge_amount, auto_recharge_fail_count")
    .eq("auto_recharge_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (candidates ?? []).filter(
    (c) =>
      c.stripe_customer_id &&
      c.stripe_payment_method_id &&
      c.auto_recharge_threshold != null &&
      c.auto_recharge_amount != null &&
      c.balance < c.auto_recharge_threshold,
  );
  if (due.length === 0) return NextResponse.json({ processed: 0 });

  const stripe = getStripe();
  let charged = 0;

  for (const c of due) {
    try {
      const pi = await stripe.paymentIntents.create({
        amount: c.auto_recharge_amount!,
        currency: "jpy",
        customer: c.stripe_customer_id!,
        payment_method: c.stripe_payment_method_id!,
        off_session: true,
        confirm: true,
      });
      if (pi.status === "succeeded") {
        const { data: credited } = await admin.rpc("credit_auto_recharge", {
          p_customer_id: c.id,
          p_org_id: c.org_id,
          p_amount: c.auto_recharge_amount!,
          p_stripe_payment_intent_id: pi.id,
        });
        if (credited) {
          charged += 1;
          await notifyCustomer(admin, c.id, `残高が少なくなったため、自動チャージを行いました（¥${c.auto_recharge_amount!.toLocaleString("ja-JP")}）。`);
        }
      } else {
        throw new Error(`payment_intent status: ${pi.status}`);
      }
    } catch {
      const failCount = (c.auto_recharge_fail_count ?? 0) + 1;
      if (failCount >= MAX_FAILURES) {
        await admin.from("customers").update({ auto_recharge_enabled: false, auto_recharge_fail_count: failCount }).eq("id", c.id);
        await notifyCustomer(admin, c.id, "カードへの請求に続けて失敗したため、自動チャージを停止しました。マイページから設定し直してください。");
      } else {
        await admin.from("customers").update({ auto_recharge_fail_count: failCount }).eq("id", c.id);
        await notifyCustomer(admin, c.id, "自動チャージに失敗しました。カード情報をご確認のうえ、必要であればマイページから設定し直してください。");
      }
    }
  }

  return NextResponse.json({ processed: due.length, charged });
}
