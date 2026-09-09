import type { Database } from "@/lib/supabase/types";

type RequestRow = Database["public"]["Tables"]["requests"]["Row"];
type RefundPolicyRow = Database["public"]["Tables"]["refund_policies"]["Row"];

export interface RefundResult {
  stage: RefundPolicyRow["stage"];
  amount: number;
  paid: number;
  mode: RefundPolicyRow["mode"];
  pct: number;
}

// 段階の決定: 見積提示前 / 承諾後・着手前 / 着手後 / 納品後 / 著しい遅延（terminate=全額保護）。
// 「著しい遅延」は目安(due_at)を過ぎてなお未完了のケース — 依頼主には内部期限を見せず、
// 「対応が大幅に遅れている場合は全額をお返しします」という文言でだけ表す。
export function refundStageFor(r: RequestRow): RefundPolicyRow["stage"] {
  if (r.phase === "completed") return "delivered";
  if (r.phase === "preparing" || r.phase === "started" || r.phase === "approved") {
    const overdue = r.due_at != null && new Date(r.due_at).getTime() < Date.now();
    if (overdue) return "terminate";
    return r.phase === "preparing" ? "accepted" : "started";
  }
  return "prequote";
}

export function computeRefund(r: RequestRow, policies: RefundPolicyRow[]): RefundResult {
  const stage = refundStageFor(r);
  const policy = policies.find((p) => p.stage === stage);
  const paid = r.paid_at ? r.amount : 0;
  if (!policy || !paid) return { stage, amount: 0, paid, mode: "nocharge", pct: 0 };
  const amount = policy.mode === "full" ? paid : policy.mode === "partial" ? Math.round((paid * policy.pct) / 100) : 0;
  return { stage, amount, paid, mode: policy.mode, pct: policy.pct };
}
