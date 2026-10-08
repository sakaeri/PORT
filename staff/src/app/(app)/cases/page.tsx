import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import { previewMessage } from "@/lib/message-preview";
import { staffSenderLabel } from "@/lib/roles";
import CasesList, { type CaseRow } from "@/components/CasesList";

export default async function CasesPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const [{ data: requests, error }, { data: caseThreads, error: threadsError }, { data: summaries, error: summariesError }, { data: unsentReports }, { data: customerThreads }, { data: departments }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, amount, phase, pay_status, due_at, created_at, customer_id, customers(name, staff_label)")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase.from("threads").select("id, request_id, archived_at").eq("org_id", ctx.orgId).eq("kind", "case"),
    supabase.rpc("case_thread_summaries", { p_org_id: ctx.orgId }),
    // 着手中（started）の案件のうち、スタッフが完了報告を提出済みだが、まだ
    // マネージャー・本部メンバーが依頼主に送っていない（＝報告済み・承認待ち）
    // ものを調べるため。
    supabase.from("completion_reports").select("request_id").is("sent_at", null),
    // 案件がどの窓口（マネージャー）の依頼主のものかを調べるため、依頼主の
    // トーク（kind='customer'）の department_id を customer_id ごとに引く。
    supabase.from("threads").select("customer_id, department_id").eq("org_id", ctx.orgId).eq("kind", "customer"),
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
  ]);
  if (error) console.error("requests select failed:", error);
  if (threadsError) console.error("case threads select failed:", threadsError);
  if (summariesError) console.error("case_thread_summaries failed:", summariesError);

  const threadByRequestId = new Map((caseThreads ?? []).map((t) => [t.request_id, t]));
  const summaryByRequestId = new Map((summaries ?? []).map((s) => [s.request_id, s]));
  const unsentReportRequestIds = new Set((unsentReports ?? []).map((r) => r.request_id));
  const departmentIdByCustomerId = new Map((customerThreads ?? []).map((t) => [t.customer_id, t.department_id]));
  // 着手後、報告の目安時間（due_at）まで残り15分以内（経過済みも含む）か
  // どうかの判定に使う閾値。ナビの赤丸バッジ（Shell.tsx）と同じ基準。
  const soonThreshold = new Date(new Date().getTime() + 15 * 60 * 1000);
  // 案件詳細（マネージャーが金額を見て着手判断をしないように）と同じ方針で、
  // 一覧でも本部以外には金額そのものをクライアントへ送らない。
  const canSeeAmount = ctx.role === "owner";
  const rows: CaseRow[] = (requests ?? []).map((r) => {
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const thread = threadByRequestId.get(r.id) ?? null;
    const summary = summaryByRequestId.get(r.id) ?? null;
    const lastMessagePreview =
      summary && summary.last_message_kind != null
        ? previewMessage(
            { kind: summary.last_message_kind, body: summary.last_message_body, payload: summary.last_message_payload, deleted_at: summary.last_message_deleted_at },
            staffSenderLabel(summary.last_message_sender_role),
          )
        : null;
    const overdue = r.due_at != null && ["preparing", "started"].includes(r.phase) && new Date(r.due_at) < new Date();
    const dueSoon = r.due_at != null && r.phase === "started" && new Date(r.due_at) <= soonThreshold;
    const reportPending = r.phase === "started" && unsentReportRequestIds.has(r.id);
    return {
      id: r.id,
      title: r.title,
      amount: canSeeAmount ? r.amount : 0,
      phase: r.phase,
      paid: r.pay_status === "paid",
      dueAt: r.due_at,
      overdue,
      dueSoon,
      reportPending,
      customerName: customer?.staff_label ?? customer?.name ?? "—",
      departmentId: departmentIdByCustomerId.get(r.customer_id) ?? null,
      threadId: thread?.id ?? null,
      archived: !!thread?.archived_at,
      lastMessagePreview,
    };
  });

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>案件トーク</div>

      {error && <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>}

      {!error && rows.length === 0 && (
        <div style={{ fontSize: 13.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
          まだ案件がありません。依頼主とのトーク画面から「案件を作成」すると、ここに表示されます。
        </div>
      )}

      {!error && rows.length > 0 && (
        <CasesList
          rows={rows}
          departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
          canDelete={ctx.role === "owner" || ctx.role === "dept_manager"}
          canSeeAmount={canSeeAmount}
        />
      )}
    </div>
  );
}
