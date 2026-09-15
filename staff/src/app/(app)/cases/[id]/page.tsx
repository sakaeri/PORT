import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import CaseDetail from "@/components/CaseDetail";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, title, note, amount, phase, created_at, quoted_at, started_at, completed_at, payment_timing, deposit_percent, deposit_amount, deposit_paid_at, pay_method, pay_status, bank_transfer_info, card_payment_link, customers(id, name), completion_reports(*), ratings(*)",
    )
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!request) notFound();

  const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const report = Array.isArray(request.completion_reports) ? request.completion_reports[0] : request.completion_reports;
  const rating = Array.isArray(request.ratings) ? request.ratings[0] : request.ratings;

  const { data: caseThread } = await supabase.from("threads").select("id").eq("kind", "case").eq("request_id", id).maybeSingle();
  let caseMessages: { id: string; sender_id: string | null; sender_role: "owner" | "reception" | "creator" | "client" | null; kind: string; body: string | null; sent_at: string; deleted_at: string | null; senderName: string | null }[] = [];
  if (caseThread) {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, sender_role, kind, body, sent_at, deleted_at, profiles!messages_sender_id_fkey(display_name)")
      .eq("thread_id", caseThread.id)
      .order("sent_at", { ascending: true });
    caseMessages = (data ?? []).map((m) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { ...m, senderName: profile?.display_name ?? null };
    });
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
        paymentTiming: request.payment_timing,
        depositPercent: request.deposit_percent,
        depositAmount: request.deposit_amount,
        depositPaidAt: request.deposit_paid_at,
        payMethod: request.pay_method,
        payStatus: request.pay_status,
        bankTransferInfo: request.bank_transfer_info,
        cardPaymentLink: request.card_payment_link,
      }}
      customer={customer ? { id: customer.id, name: customer.name } : null}
      report={report ? { summary: report.summary, noteToCustomer: report.note_to_customer, details: report.details ?? [] } : null}
      rating={rating ? { stars: rating.stars, comment: rating.comment, skipped: rating.skipped } : null}
      caseThread={caseThread ? { id: caseThread.id } : null}
      caseMessages={caseMessages}
      orgId={ctx.orgId}
      currentUserId={ctx.userId}
    />
  );
}
