import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { notifyStaffQuoteStale } from "@/lib/notify";

// 見積を出したまま何日も入金確認が押されていない案件を、事業者にメールで
// 気づかせるための日次バッチ。同じ見積に何度も送らないよう
// requests.reminder_sent_at で一度きりにする。
const REMINDER_AFTER_DAYS = 3;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale, error } = await admin
    .from("requests")
    .select("id, org_id, title, amount, quoted_at")
    .eq("phase", "quoted")
    .is("reminder_sent_at", null)
    .lt("quoted_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!stale || stale.length === 0) return NextResponse.json({ notified: 0 });

  const byOrg = new Map<string, typeof stale>();
  for (const r of stale) {
    const list = byOrg.get(r.org_id) ?? [];
    list.push(r);
    byOrg.set(r.org_id, list);
  }

  for (const [orgId, requests] of byOrg) {
    await notifyStaffQuoteStale(
      admin,
      orgId,
      // quoted_at はDB上nullableな型だが、直前の .lt("quoted_at", cutoff) を
      // 通過している以上ここでは必ず値が入っている。
      requests.map((r) => ({ title: r.title, amount: r.amount, quotedAt: r.quoted_at! })),
    );
  }

  await admin
    .from("requests")
    .update({ reminder_sent_at: new Date().toISOString() })
    .in("id", stale.map((r) => r.id));

  return NextResponse.json({ notified: stale.length });
}
