import type { Database } from "@/lib/supabase/types";

type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];
// 呼び出し側（案件詳細画面など）は必ずしも requests の全カラムを
// 持っているとは限らないため、実際に使うフィールドだけを要求する。
type RequestRow = Pick<
  Database["public"]["Tables"]["requests"]["Row"],
  "phase" | "due_at" | "paid_at" | "amount" | "payment_timing" | "deposit_amount" | "deposit_paid_at"
>;

export interface RefundResult {
  stage: RefundPolicyRow["stage"];
  amount: number;
  paid: number;
  mode: RefundPolicyRow["mode"];
  pct: number;
}

// 依頼主アプリ側(src/lib/refund.ts)とロジックを揃えている
// （受付側からのキャンセルでも同じ返金額になるようにするため）。
export function refundStageFor(r: RequestRow): RefundPolicyRow["stage"] {
  if (r.phase === "completed") return "delivered";
  if (r.phase === "preparing" || r.phase === "started") {
    const overdue = r.due_at != null && new Date(r.due_at).getTime() < Date.now();
    if (overdue) return "terminate";
    return r.phase === "preparing" ? "accepted" : "started";
  }
  return "prequote";
}

// 実際に入金済みの額。予約金だけ入金済みで残金が未確認（paid_at はまだ立たない）の
// 場合は予約金分を基準にする。
function paidAmountFor(r: RequestRow): number {
  if (r.paid_at) return r.amount;
  if (r.payment_timing === "deposit" && r.deposit_paid_at) return r.deposit_amount ?? 0;
  return 0;
}

export function computeRefund(r: RequestRow, policies: RefundPolicyRow[]): RefundResult {
  const stage = refundStageFor(r);
  const policy = policies.find((p) => p.stage === stage);
  const paid = paidAmountFor(r);
  if (!policy || !paid) return { stage, amount: 0, paid, mode: "nocharge", pct: 0 };
  const amount = policy.mode === "full" ? paid : policy.mode === "partial" ? Math.round((paid * policy.pct) / 100) : 0;
  return { stage, amount, paid, mode: policy.mode, pct: policy.pct };
}
