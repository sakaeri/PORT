import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import CustomerThread, { MESSAGE_PAGE_SIZE, type ThreadMessage } from "@/components/CustomerThread";

function mapMessageRows(data: NonNullable<Awaited<ReturnType<typeof fetchMessagePage>>["data"]>): ThreadMessage[] {
  return data.map((m) => {
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

function fetchMessagePage(supabase: Awaited<ReturnType<typeof createClient>>, threadId: string) {
  // 画面に必要な最新分だけ取得する（会話が長くなっても初回表示は遅くならない）。
  // 昇順で表示するため、直近N件を降順で取ってから並べ替える。
  return supabase
    .from("messages")
    .select("*, message_attachments(*), requests(phase, amount, completion_reports(summary, details, note_to_customer))")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();

  // 依存のないクエリは並列で投げる（順番に await すると往復回数分だけ遅くなる）。
  const [
    { data: customer },
    { data: thread },
    { data: templateRows },
    { data: menuRows },
    { data: memoRows },
    { data: ratingRows },
    { data: latestRequestRow },
    { data: orgPayment },
    { data: cardPaymentLinks },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, member_no, converted_org_id, converted_org:organizations!customers_converted_org_id_fkey(display_name, slug)")
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    supabase.from("threads").select("id, archived_at").eq("customer_id", id).eq("kind", "customer").maybeSingle(),
    supabase.from("intake_forms").select("id, label, note, intake_fields(id, label, required, sort)").eq("org_id", ctx.orgId).order("sort", { ascending: true }),
    supabase
      .from("menus")
      .select("id, label, note, price, payout, lead_hours")
      .eq("org_id", ctx.orgId)
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("work_memos")
      .select("id, author_id, body, created_at, profiles!work_memos_author_id_fkey(display_name)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("ratings").select("stars, comment, skipped, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase
      .from("requests")
      .select("id, title, amount, phase")
      .eq("customer_id", id)
      .not("phase", "in", "(completed,cancelled,declined)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("organizations").select("card_payment_enabled, bank_transfer_info").eq("id", ctx.orgId).single(),
    supabase.from("card_payment_links").select("id, title, url").eq("org_id", ctx.orgId).order("created_at", { ascending: false }),
  ]);

  if (!customer) notFound();
  const convertedOrgRaw = Array.isArray(customer.converted_org) ? customer.converted_org[0] : customer.converted_org;
  const convertedOrg = convertedOrgRaw ? { displayName: convertedOrgRaw.display_name, slug: convertedOrgRaw.slug } : null;

  const templates = (templateRows ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    note: t.note,
    fieldCount: (t.intake_fields ?? []).length,
    fields: (t.intake_fields ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((f) => ({ label: f.label, required: f.required })),
  }));
  const menus = (menuRows ?? []).map((m) => ({ id: m.id, label: m.label, note: m.note, price: m.price, payout: m.payout, leadHours: m.lead_hours }));
  const memos = (memoRows ?? []).map((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return { id: m.id, authorId: m.author_id, authorName: profile?.display_name ?? "スタッフ", body: m.body, createdAt: m.created_at };
  });
  const rated = (ratingRows ?? []).filter((r) => !r.skipped && r.stars != null);
  const ratings = {
    average: rated.length ? rated.reduce((sum, r) => sum + (r.stars ?? 0), 0) / rated.length : null,
    count: rated.length,
    items: rated.map((r) => ({ stars: r.stars, comment: r.comment })),
  };
  const latestRequest = latestRequestRow ? { id: latestRequestRow.id, title: latestRequestRow.title, amount: latestRequestRow.amount, phase: latestRequestRow.phase } : null;

  let initialMessages: ThreadMessage[] = [];
  let hasMoreOlder = false;
  if (thread) {
    const { data } = await fetchMessagePage(supabase, thread.id);
    const rows = data ?? [];
    hasMoreOlder = rows.length === MESSAGE_PAGE_SIZE;
    initialMessages = mapMessageRows(rows.slice().reverse());
  }

  return (
    <CustomerThread
      customer={{ id: customer.id, name: customer.name, memberNo: customer.member_no }}
      thread={thread ? { id: thread.id, archived: !!thread.archived_at } : null}
      initialMessages={initialMessages}
      initialHasMoreOlder={hasMoreOlder}
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
