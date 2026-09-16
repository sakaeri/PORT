import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import MonthlyMenuBreakdown, { type MonthBreakdown } from "@/components/MonthlyMenuBreakdown";

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
  const { data: requests, error } = await supabase
    .from("requests")
    .select("id, phase, amount, pay_status, deposit_amount, paid_at, deposit_paid_at")
    .eq("org_id", orgId);

  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>;

  const rows = requests ?? [];
  // 実際に着金確認できた金額だけを合計する（見積もり金額ではない）。
  // pay_status='paid'なら全額、'processing'（予約金のみ確認済み）ならdeposit_amountの分だけ数える。
  const total = rows.reduce((s, r) => {
    if (r.pay_status === "paid") return s + r.amount;
    if (r.pay_status === "processing") return s + (r.deposit_amount ?? 0);
    return s;
  }, 0);
  const quoted = rows.filter((r) => r.phase === "quoted").length;
  const completed = rows.filter((r) => r.phase === "completed").length;

  // 入金確認1回＝1件として、確認した月ごとに集計する。
  const entries = rows.flatMap((r) => {
    const list: { requestId: string; amount: number; at: string }[] = [];
    if (r.pay_status === "paid" && r.paid_at) list.push({ requestId: r.id, amount: r.amount, at: r.paid_at });
    else if (r.pay_status === "processing" && r.deposit_paid_at) list.push({ requestId: r.id, amount: r.deposit_amount ?? 0, at: r.deposit_paid_at });
    return list;
  });

  // 確認できた金額を、その依頼の内訳（request_items）の比率で按分してメニューごとに集計する
  // （予約金など一部だけ確認済みの場合も、全項目に同じ比率で配分する）。
  const requestIds = Array.from(new Set(entries.map((e) => e.requestId)));
  const { data: itemRows } = requestIds.length ? await supabase.from("request_items").select("request_id, label, price, qty").in("request_id", requestIds) : { data: [] };
  const itemsByRequest = new Map<string, { label: string; price: number; qty: number }[]>();
  for (const it of itemRows ?? []) {
    const list = itemsByRequest.get(it.request_id) ?? [];
    list.push(it);
    itemsByRequest.set(it.request_id, list);
  }

  const breakdownByMonth = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const key = monthKeyJST(e.at);
    const bucket = breakdownByMonth.get(key) ?? new Map<string, number>();
    const items = itemsByRequest.get(e.requestId) ?? [];
    const itemTotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    if (items.length && itemTotal > 0) {
      for (const it of items) {
        const share = ((it.price * it.qty) / itemTotal) * e.amount;
        bucket.set(it.label, (bucket.get(it.label) ?? 0) + share);
      }
    } else {
      bucket.set("その他", (bucket.get("その他") ?? 0) + e.amount);
    }
    breakdownByMonth.set(key, bucket);
  }

  const oldestKey = entries.length ? entries.map((e) => monthKeyJST(e.at)).reduce((a, b) => (a < b ? a : b)) : null;
  const months: MonthBreakdown[] = monthRange(oldestKey).map((m) => {
    const bucket = breakdownByMonth.get(m.key);
    const items = bucket
      ? Array.from(bucket.entries())
          .map(([label, amount]) => ({ label, amount }))
          .sort((a, b) => b.amount - a.amount)
      : [];
    return { key: m.key, label: m.label, items };
  });

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile label="累計入金額（確認済み）" value={yen(total)} />
        <StatTile label="完了件数" value={`${completed}件`} />
        <StatTile label="見積もり回答待ち" value={`${quoted}件`} />
      </div>

      <SectionTitle>月別・メニュー別の入金額</SectionTitle>
      <MonthlyMenuBreakdown months={months} />

      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        入金額は受付が「入金を確認した」を押した分だけ反映されます。
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-neutral-400)", marginTop: 4 }}>{children}</div>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: "1 1 160px", padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20, marginTop: 4 }}>{value}</div>
    </div>
  );
}
