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

  // 互いに依存しないクエリは並列で投げる（案件トークのメッセージだけは
  // threads.id が要るので、案件トークの行を取ったあとに投げる）。
  const [{ data: request }, { data: refundPolicies }, { data: caseStaffRows }, { data: staffPool }, { data: caseThread }] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, title, note, amount, phase, created_at, quoted_at, started_at, completed_at, due_at, paid_at, payment_timing, deposit_percent, deposit_amount, deposit_paid_at, pay_method, pay_status, bank_transfer_info, card_payment_link, final_card_payment_link, customers(id, name), completion_reports(*), ratings(*)",
      )
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    supabase.from("refund_policies").select("*").eq("org_id", ctx.orgId),
    supabase.from("case_staff").select("profile_id, profiles!case_staff_profile_id_fkey(display_name, staff_alias)").eq("request_id", id),
    canAssignStaff
      ? supabase.from("profiles").select("id, display_name, staff_alias").eq("org_id", ctx.orgId).eq("role", "dept_leader")
      : Promise.resolve({ data: [] }),
    supabase.from("threads").select("id, archived_at").eq("kind", "case").eq("request_id", id).maybeSingle(),
  ]);
  if (!request) notFound();

  const assignedStaff = (caseStaffRows ?? []).map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return { id: r.profile_id, displayName: profile?.staff_alias ?? profile?.display_name ?? "" };
  });
  const availableStaff = (staffPool ?? []).map((p) => ({ id: p.id, displayName: p.staff_alias ?? p.display_name }));

  const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const report = Array.isArray(request.completion_reports) ? request.completion_reports[0] : request.completion_reports;
  const rating = Array.isArray(request.ratings) ? request.ratings[0] : request.ratings;

  let caseMessages: { id: string; sender_id: string | null; sender_role: AppRole | null; kind: string; body: string | null; sent_at: string; deleted_at: string | null }[] = [];
  if (caseThread) {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at")
      .eq("thread_id", caseThread.id)
      .order("sent_at", { ascending: true });
    caseMessages = data ?? [];
  }

  return (
    <CaseDetail
      request={{
        id: request.id,
        title: request.title,
        note: request.note,
        amount: request.amount,
        phase: request.phase,
        createdAt: request.created_at,
        dueAt: request.due_at,
        paidAt: request.paid_at,
        paymentTiming: request.payment_timing,
        depositPercent: request.deposit_percent,
        depositAmount: request.deposit_amount,
        depositPaidAt: request.deposit_paid_at,
        payMethod: request.pay_method,
        payStatus: request.pay_status,
        bankTransferInfo: request.bank_transfer_info,
        cardPaymentLink: request.card_payment_link,
        finalCardPaymentLink: request.final_card_payment_link,
      }}
      refundPolicies={refundPolicies ?? []}
      customer={customer ? { id: customer.id, name: customer.name } : null}
      report={report ? { summary: report.summary, noteToCustomer: report.note_to_customer, details: report.details ?? [] } : null}
      rating={rating ? { stars: rating.stars, comment: rating.comment, skipped: rating.skipped } : null}
      caseThread={caseThread ? { id: caseThread.id, archived: !!caseThread.archived_at } : null}
      caseMessages={caseMessages}
      orgId={ctx.orgId}
      currentUserId={ctx.userId}
      assignedStaff={assignedStaff}
      availableStaff={availableStaff}
      canAssignStaff={canAssignStaff}
    />
  );
}
