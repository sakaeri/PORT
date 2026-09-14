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
    .select("id, title, note, amount, phase, created_at, quoted_at, started_at, completed_at, customers(id, name), completion_reports(*), ratings(*)")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!request) notFound();

  const customer = Array.isArray(request.customers) ? request.customers[0] : request.customers;
  const report = Array.isArray(request.completion_reports) ? request.completion_reports[0] : request.completion_reports;
  const rating = Array.isArray(request.ratings) ? request.ratings[0] : request.ratings;

  return (
    <CaseDetail
      request={{
        id: request.id,
        title: request.title,
        note: request.note,
        amount: request.amount,
        phase: request.phase,
        createdAt: request.created_at,
      }}
      customer={customer ? { id: customer.id, name: customer.name } : null}
      report={report ? { summary: report.summary, noteToCustomer: report.note_to_customer } : null}
      rating={rating ? { stars: rating.stars, comment: rating.comment, skipped: rating.skipped } : null}
    />
  );
}
