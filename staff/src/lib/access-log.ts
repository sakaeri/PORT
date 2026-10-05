import "server-only";
import { createClient } from "@/lib/supabase/server";

// 依頼主の情報（連絡先・やり取りなど）を開いた記録を残す。トラブル時に
// 「誰が・いつ・どの依頼主を見たか」を後から調べられるようにするためだけの
// ログで、閲覧そのものを妨げない（失敗しても画面表示は止めない）。
export async function logAccess(orgId: string, actorId: string, action: string, customerId: string | null, requestId: string | null) {
  try {
    const supabase = await createClient();
    await supabase.from("access_logs").insert({ org_id: orgId, actor_id: actorId, action, customer_id: customerId, request_id: requestId });
  } catch {
    // 閲覧履歴の記録失敗で本来の画面表示を止めたくないため、ここで握りつぶす。
  }
}
