import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Vercel Cronから毎日呼ばれる。トライアル終了日を過ぎてもまだ有料契約に
// 切り替わっていない事業者を past_due にする。実際のソフトロック（新規の
// 書き込みを止める）は getStaffContext() が trial_ends_on 超過を直接
// 見ているため、このバッチを待たずに即時反映される — これは本部側の
// 一覧・売上試算の plan_status 表示を正確に保つための後追いの同期。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("organizations")
    .update({ plan_status: "past_due" })
    .eq("plan_status", "trial")
    .eq("is_hq", false)
    .lt("trial_ends_on", today)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: data?.length ?? 0 });
}
