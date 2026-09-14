import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import { PHASE_LABEL } from "@/lib/stage";

export default async function CasesPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("requests")
    .select("id, title, amount, phase, created_at, customers(name)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  const rows = (requests ?? []).map((r) => {
    const customer = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return { id: r.id, title: r.title, amount: r.amount, phase: r.phase, customerName: customer?.name ?? "—", createdAt: r.created_at };
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/cases/${r.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{r.customerName}</div>
            </div>
            <div style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>¥{r.amount.toLocaleString("ja-JP")}</div>
            <div style={{ flex: "none", fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--color-divider)", color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
              {PHASE_LABEL[r.phase]}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
