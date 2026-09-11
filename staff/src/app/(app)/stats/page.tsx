import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";

const PLAN_LABEL: Record<string, string> = {
  trial: "トライアル中",
  active: "契約中",
  past_due: "支払い遅延",
  paused: "一時停止",
  cancelled: "解約済み",
};

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export default async function StatsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>売上・実績</div>
      {ctx.isHq ? <HqStats /> : <OrgStats orgId={ctx.orgId} />}
    </div>
  );
}

async function HqStats() {
  const supabase = await createClient();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, display_name, plan_status, base_fee, seat_price, seats")
    .eq("is_hq", false)
    .order("display_name", { ascending: true });

  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>;

  const rows = (orgs ?? []).map((o) => ({
    ...o,
    monthly: o.plan_status === "active" ? o.base_fee + o.seat_price * o.seats : 0,
  }));
  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0);
  const activeCount = rows.filter((r) => r.plan_status === "active").length;

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile label="登録事業者数" value={`${rows.length}件`} />
        <StatTile label="契約中" value={`${activeCount}件`} />
        <StatTile label="月間売上（見込み）" value={yen(totalMonthly)} />
      </div>

      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        PORT本部の画面では、依頼主からの見積もり金額ではなく、PORTに登録している各事業者の基本料・席数から算出した、PORT自体の売上を表示しています。
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>まだ登録事業者がいません。</div>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.display_name}</div>
            <div style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>{PLAN_LABEL[r.plan_status] ?? r.plan_status}</div>
            <div style={{ flex: "none", fontSize: 12.5, width: 90, textAlign: "right" }}>{yen(r.monthly)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

async function OrgStats({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data: requests, error } = await supabase.from("requests").select("phase, amount").eq("org_id", orgId);

  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>;

  const billable = (requests ?? []).filter((r) => ["preparing", "started", "approved", "completed"].includes(r.phase));
  const total = billable.reduce((s, r) => s + r.amount, 0);
  const quoted = (requests ?? []).filter((r) => r.phase === "quoted").length;
  const completed = billable.filter((r) => r.phase === "completed").length;

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile label="累計売上（決済済み）" value={yen(total)} />
        <StatTile label="完了件数" value={`${completed}件`} />
        <StatTile label="見積もり回答待ち" value={`${quoted}件`} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        月別の内訳やスタッフごとの実績は次のフェーズで対応します。
      </div>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: "1 1 160px", padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
      <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20, marginTop: 4 }}>{value}</div>
    </div>
  );
}
