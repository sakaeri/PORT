import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import CaseDetail from "@/components/CaseDetail";
import type { AppRole } from "@/lib/supabase/types";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const canAssignStaff = ctx.role !== "dept_leader";
  // スタッフ（dept_leader）には金額・支払い方法・返金関連の情報を一切渡さない
  // （表示を隠すだけでなく、サーバー側で値そのものを送らないようにする）。
  const canSeeFinance = ctx.role === "owner" || ctx.role === "dept_manager";

  // マネージャーが案件に割り当てられるのは「自分に割り当てられている
  // スタッフ」だけ（他のマネージャーのスタッフは選べない）。オーナーは
  // 全スタッフから選べる。
  const isManagerAssigning = canAssignStaff && ctx.role === "dept_manager";

  // タップしてからこの画面が出るまでの体感速度のため、全クエリを並列で投げる
  // （案件トークのメッセージは threads.id が要るが、messages を threads の
  // embed として一緒に取ることで、往復を1回減らしている）。
  const [{ data: request }, { data: refundPolicies }, { data: caseStaffRows }, { data: staffPool }, { data: caseThread }, { data: staffDepartments }] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, title, note, amount, phase, created_at, quoted_at, started_at, completed_at, due_at, cancel_requested_at, paid_at, payment_timing, deposit_amount, deposit_paid_at, pay_status, hourly_rate, hourly_cap, customers(id, name), completion_reports(*), ratings(*), request_subscriptions(id, cadence, active, next_due_at)",
      )
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    supabase.from("refund_policies").select("*").eq("org_id", ctx.orgId),
    supabase.from("case_staff").select("profile_id, profiles!case_staff_profile_id_fkey(display_name, staff_alias)").eq("request_id", id),
    canAssignStaff
      ? supabase.from("profiles").select("id, display_name, staff_alias").eq("org_id", ctx.orgId).eq("role", "dept_leader")
      : Promise.resolve({ data: [] }),
    supabase
      .from("threads")
      .select("id, archived_at, messages(id, sender_id, sender_role, kind, body, sent_at, deleted_at)")
      .eq("kind", "case")
      .eq("request_id", id)
      .order("sent_at", { referencedTable: "messages", ascending: true })
      .maybeSingle(),
    isManagerAssigning ? supabase.from("staff_departments").select("profile_id, department_id") : Promise.resolve({ data: [] }),
  ]);
  if (!request) notFound();

  // 表示名は「本人には常に本人の本当の表示名、他人にはエイリアス」が
  // ルールなので、自分自身の行だけは staff_alias を無視して display_name を使う。
  const assignedStaff = (caseStaffRows ?? []).map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const displayName = r.profile_id === ctx.userId ? (profile?.display_name ?? "") : (profile?.staff_alias ?? profile?.display_name ?? "");
    return { id: r.profile_id, displayName };
  });
  const myDepartmentIds = (staffDepartments ?? []).filter((d) => d.profile_id === ctx.userId).map((d) => d.department_id);
  const departmentIdsByProfile = new Map<string, string[]>();
  for (const row of staffDepartments ?? []) {
    const list = departmentIdsByProfile.get(row.profile_id) ?? [];
    list.push(row.department_id);
    departmentIdsByProfile.set(row.profile_id, list);
  }
  const availableStaff = (staffPool ?? [])
    .filter((p) => !isManagerAssigning || (departmentIdsByProfile.get(p.id) ?? []).some((id) => myDepartmentIds.includes(id)))
    .map((p) => ({
      id: p.id,
      displayName: p.id === ctx.userId ? p.display_name : (p.staff_alias ?? p.display_name),
    }));

  const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const report = Array.isArray(request.completion_reports) ? request.completion_reports[0] : request.completion_reports;
  const rating = Array.isArray(request.ratings) ? request.ratings[0] : request.ratings;
  const subscription = Array.isArray(request.request_subscriptions) ? request.request_subscriptions[0] : request.request_subscriptions;
  const reportPending = !!report && !report.sent_at;

  const caseMessages: { id: string; sender_id: string | null; sender_role: AppRole | null; kind: string; body: string | null; sent_at: string; deleted_at: string | null }[] = caseThread?.messages ?? [];

  return (
    <CaseDetail
      request={{
        id: request.id,
        title: request.title,
        note: request.note,
        amount: canSeeFinance ? request.amount : 0,
        phase: request.phase,
        createdAt: request.created_at,
        dueAt: request.due_at,
        cancelRequestedAt: request.cancel_requested_at,
        paidAt: canSeeFinance ? request.paid_at : null,
        paymentTiming: request.payment_timing,
        depositAmount: canSeeFinance ? request.deposit_amount : null,
        depositPaidAt: canSeeFinance ? request.deposit_paid_at : null,
        payStatus: canSeeFinance ? request.pay_status : "",
        hourlyRate: canSeeFinance ? request.hourly_rate : null,
        hourlyCap: canSeeFinance ? request.hourly_cap : null,
      }}
      refundPolicies={canSeeFinance ? (refundPolicies ?? []) : []}
      customer={customer ? { id: customer.id, name: customer.name } : null}
      report={report ? { summary: report.summary, noteToCustomer: report.note_to_customer, details: report.details ?? [], pending: reportPending } : null}
      rating={rating ? { stars: rating.stars, comment: rating.comment, skipped: rating.skipped } : null}
      caseThread={caseThread ? { id: caseThread.id, archived: !!caseThread.archived_at } : null}
      caseMessages={caseMessages}
      orgId={ctx.orgId}
      currentUserId={ctx.userId}
      assignedStaff={assignedStaff}
      availableStaff={availableStaff}
      canAssignStaff={canAssignStaff}
      canSeeFinance={canSeeFinance}
      subscription={canSeeFinance && subscription ? { id: subscription.id, cadence: subscription.cadence, active: subscription.active, nextDueAt: subscription.next_due_at } : null}
    />
  );
}
