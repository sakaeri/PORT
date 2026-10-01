import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// 定期対応（毎週・毎月）の日次バッチ。周期が来ている定期対応を1件ずつ
// charge_subscription_occurrence に渡す。実際の作成・課金・通知の
// 判断（残高不足なら作らず通知するだけ、等）はすべてそのDB関数側で行う。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: due, error } = await admin
    .from("request_subscriptions")
    .select("id")
    .eq("active", true)
    .lte("next_due_at", new Date().toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 });

  let created = 0;
  for (const sub of due) {
    const { data, error: rpcError } = await admin.rpc("charge_subscription_occurrence", { p_subscription_id: sub.id });
    if (rpcError) continue;
    if (data) created += 1;
  }

  return NextResponse.json({ processed: due.length, created });
}
