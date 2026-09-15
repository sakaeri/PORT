import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import CasesList, { type CaseRow } from "@/components/CasesList";

export default async function CasesPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const [{ data: requests, error }, { data: caseThreads }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, amount, phase, created_at, customers(name)")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false }),
    supabase.from("threads").select("id, request_id, archived_at").eq("org_id", ctx.orgId).eq("kind", "case"),
  ]);

  const threadByRequestId = new Map((caseThreads ?? []).map((t) => [t.request_id, t]));
  const rows: CaseRow[] = (requests ?? []).map((r) => {
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    const thread = threadByRequestId.get(r.id) ?? null;
    return {
      id: r.id,
      title: r.title,
      amount: r.amount,
      phase: r.phase,
      customerName: customer?.name ?? "—",
      threadId: thread?.id ?? null,
      archived: !!thread?.archived_at,
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

      {!error && rows.length > 0 && <CasesList rows={rows} />}
    </div>
  );
}
