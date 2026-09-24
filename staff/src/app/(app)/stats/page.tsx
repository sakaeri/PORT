import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import MonthlyMenuBreakdown, { type MonthBreakdown, type MonthRow } from "@/components/MonthlyMenuBreakdown";

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

function nowJSTYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return { year: Number(parts.find((p) => p.type === "year")!.value), month: Number(parts.find((p) => p.type === "month")!.value) };
}

function monthKeyJST(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function monthKeyFromYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

// 実績のある最も古い月〜今月までを連続した一覧にする（データがなければ今月だけ）。
function monthRange(oldestKey: string | null): { key: string; label: string }[] {
  const { year, month } = nowJSTYearMonth();
  const currentKey = monthKeyFromYM(year, month);
  const start = oldestKey && oldestKey < currentKey ? parseMonthKey(oldestKey) : { year, month };
  const out: { key: string; label: string }[] = [];
  let { year: y, month: m } = start;
  while (monthKeyFromYM(y, m) <= currentKey) {
    out.push({ key: monthKeyFromYM(y, m), label: `${y}年${m}月` });
    ({ year: y, month: m } = addMonths(y, m, 1));
  }
  return out;
}

export default async function StatsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // スタッフ（dept_leader）は依頼主とは直接やり取りしない役割で、
  // 売上・実績も見せない。直接URLで来ても弾く。
  if (ctx.role === "dept_leader") return null;

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
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
  const { data: requests, error } = await supabase
    .from("requests")
    .select("id, title, phase, amount, pay_status, deposit_amount, paid_at, deposit_paid_at, customers(name)")
    .eq("org_id", orgId);

  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>;

  const rows = requests ?? [];
  function customerNameOf(r: (typeof rows)[number]): string {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return c?.name ?? "—";
  }

  // 実際に着金確認できた金額だけを合計する（見積もり金額ではない）。
  // pay_status='paid'なら全額、'processing'（予約金のみ確認済み）ならdeposit_amountの分だけ数える。
  const total = rows.reduce((s, r) => {
    if (r.pay_status === "paid") return s + r.amount;
    if (r.pay_status === "processing") return s + (r.deposit_amount ?? 0);
    return s;
  }, 0);
  const quoted = rows.filter((r) => r.phase === "quoted").length;
  const completed = rows.filter((r) => r.phase === "completed").length;

  // 確認できた入金は、確認した月ごとに1件＝1行としてそのまま表示する（依頼主・見積もりタイトルつき）。
  const confirmedRows: (MonthRow & { at: string })[] = [];
  for (const r of rows) {
    if (r.pay_status === "paid" && r.paid_at) {
      confirmedRows.push({ requestId: r.id, customerName: customerNameOf(r), title: r.title, amount: r.amount, status: "paid", at: r.paid_at });
    } else if (r.pay_status === "processing" && r.deposit_paid_at) {
      confirmedRows.push({ requestId: r.id, customerName: customerNameOf(r), title: r.title, amount: r.deposit_amount ?? 0, status: "paid", at: r.deposit_paid_at });
    }
  }
  const paidByMonth = new Map<string, MonthRow[]>();
  for (const c of confirmedRows) {
    const key = monthKeyJST(c.at);
    const list = paidByMonth.get(key) ?? [];
    list.push(c);
    paidByMonth.set(key, list);
  }

  // 入金待ち（未回収）は、過去の月ではなく今の状況として今月のところにだけ表示する。
  const pendingRows: MonthRow[] = rows
    .filter((r) => r.pay_status !== "paid" && !["draft", "cancelled", "declined"].includes(r.phase))
    .map((r) => ({
      requestId: r.id,
      customerName: customerNameOf(r),
      title: r.title,
      amount: r.pay_status === "processing" ? r.amount - (r.deposit_amount ?? 0) : r.amount,
      status: "pending" as const,
    }))
    .filter((r) => r.amount > 0);

  const oldestKey = confirmedRows.length ? confirmedRows.map((c) => monthKeyJST(c.at)).reduce((a, b) => (a < b ? a : b)) : null;
  const { year, month } = nowJSTYearMonth();
  const currentKey = monthKeyFromYM(year, month);
  const months: MonthBreakdown[] = monthRange(oldestKey).map((m) => {
    const paid = paidByMonth.get(m.key) ?? [];
    return { key: m.key, label: m.label, rows: m.key === currentKey ? [...pendingRows, ...paid] : paid };
  });

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatTile label="累計入金額（確認済み）" value={yen(total)} />
        <StatTile label="完了件数" value={`${completed}件`} />
        <StatTile label="見積もり回答待ち" value={`${quoted}件`} />
      </div>

      <SectionTitle>月別の入金状況</SectionTitle>
      <MonthlyMenuBreakdown months={months} />

      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        入金額は受付が「入金を確認した」を押した分だけ反映されます。行をタップするとその案件トークに移動します。
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-neutral-400)", marginTop: 4 }}>{children}</div>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, padding: "12px 10px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 17, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
