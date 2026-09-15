import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import CustomerThread, { type ThreadMessage } from "@/components/CustomerThread";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, member_no, converted_org_id, converted_org:organizations!customers_converted_org_id_fkey(display_name, slug)")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!customer) notFound();
  const convertedOrgRaw = Array.isArray(customer.converted_org) ? customer.converted_org[0] : customer.converted_org;
  const convertedOrg = convertedOrgRaw ? { displayName: convertedOrgRaw.display_name, slug: convertedOrgRaw.slug } : null;

  const { data: thread } = await supabase
    .from("threads")
    .select("id, archived_at")
    .eq("customer_id", id)
    .eq("kind", "customer")
    .maybeSingle();

  const { data: templateRows } = await supabase
    .from("intake_forms")
    .select("id, label, note, intake_fields(id)")
    .eq("org_id", ctx.orgId)
    .order("sort", { ascending: true });
  const templates = (templateRows ?? []).map((t) => ({ id: t.id, label: t.label, note: t.note, fieldCount: (t.intake_fields ?? []).length }));

  const { data: menuRows } = await supabase
    .from("menus")
    .select("id, label, note, price, payout, lead_hours")
    .eq("org_id", ctx.orgId)
    .eq("active", true)
    .order("sort", { ascending: true });
  const menus = (menuRows ?? []).map((m) => ({ id: m.id, label: m.label, note: m.note, price: m.price, payout: m.payout, leadHours: m.lead_hours }));

  const { data: memoRows } = await supabase
    .from("work_memos")
    .select("id, author_id, body, created_at, profiles!work_memos_author_id_fkey(display_name)")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });
  const memos = (memoRows ?? []).map((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return { id: m.id, authorId: m.author_id, authorName: profile?.display_name ?? "スタッフ", body: m.body, createdAt: m.created_at };
  });

  const { data: ratingRows } = await supabase
    .from("ratings")
    .select("stars, comment, skipped, created_at")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });
  const rated = (ratingRows ?? []).filter((r) => !r.skipped && r.stars != null);
  const ratings = {
    average: rated.length ? rated.reduce((sum, r) => sum + (r.stars ?? 0), 0) / rated.length : null,
    count: rated.length,
    items: rated.map((r) => ({ stars: r.stars, comment: r.comment })),
  };

  const { data: latestRequestRow } = await supabase
    .from("requests")
    .select("id, title, amount, phase")
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestRequest = latestRequestRow ? { id: latestRequestRow.id, title: latestRequestRow.title, amount: latestRequestRow.amount, phase: latestRequestRow.phase } : null;

  const { data: orgPayment } = await supabase
    .from("organizations")
    .select("card_payment_enabled, bank_transfer_info")
    .eq("id", ctx.orgId)
    .single();

  const { data: cardPaymentLinks } = await supabase
    .from("card_payment_links")
    .select("id, title, url")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  let initialMessages: ThreadMessage[] = [];
  if (thread) {
    const { data } = await supabase
      .from("messages")
      .select("*, message_attachments(*), requests(phase, amount, completion_reports(summary, details, note_to_customer))")
      .eq("thread_id", thread.id)
      .order("sent_at", { ascending: true });
    initialMessages = (data ?? []).map((m) => {
      const req = Array.isArray(m.requests) ? m.requests[0] : m.requests;
      const reportRaw = req ? (Array.isArray(req.completion_reports) ? req.completion_reports[0] : req.completion_reports) : null;
      return {
        ...m,
        attachments: m.message_attachments ?? [],
        requestPhase: req?.phase ?? null,
        requestAmount: req?.amount ?? null,
        report: reportRaw ? { summary: reportRaw.summary, details: reportRaw.details ?? [], noteToCustomer: reportRaw.note_to_customer } : null,
      };
    });
  }

  return (
    <CustomerThread
      customer={{ id: customer.id, name: customer.name, memberNo: customer.member_no }}
      thread={thread ? { id: thread.id, archived: !!thread.archived_at } : null}
      initialMessages={initialMessages}
      role={ctx.role}
      currentUserId={ctx.userId}
      orgId={ctx.orgId}
      isHq={ctx.isHq}
      convertedOrg={convertedOrg}
      templates={templates}
      menus={menus}
      memos={memos}
      ratings={ratings}
      latestRequest={latestRequest}
      cardPaymentEnabled={orgPayment?.card_payment_enabled ?? false}
      defaultBankInfo={orgPayment?.bank_transfer_info ?? {}}
      cardPaymentLinks={cardPaymentLinks ?? []}
    />
  );
}
