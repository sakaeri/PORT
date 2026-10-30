import Link from "next/link";
import { redirect } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import InfoTooltip from "@/components/InfoTooltip";
import type { MonthBreakdown, MonthRow } from "@/components/MonthlyMenuBreakdown";
import DepartmentStatsList, { type DepartmentStat } from "@/components/DepartmentStatsList";
import type { StaffRole } from "@/lib/supabase/types";

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

function monthKeyFromYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// 前の月にさかのぼれるのは1年分まで。
const MAX_MONTHS_BACK = 12;
// 紹介特典1件あたりの額（DB関数 grant_referral_credit と同じ）。
const REFERRAL_CREDIT = 5000;

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// ?m=2026-09 で表示する月を選ぶ（無い・範囲外なら今月）。
function selectedMonth(raw: string | undefined): { year: number; month: number; back: number } {
  const now = nowJSTYearMonth();
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const back = (now.year - Number(m[1])) * 12 + (now.month - Number(m[2]));
    if (back >= 0 && back <= MAX_MONTHS_BACK) return { year: Number(m[1]), month: Number(m[2]), back };
  }
  return { ...now, back: 0 };
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // 売上・実績は本部（オーナー）専用。秘書・スタッフが直接URLで来ても出さない。
  if (ctx.role !== "owner" && ctx.role !== "reception") redirect("/today");

  const { year, month, back } = selectedMonth((await searchParams).m);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const monthNav: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, verticalAlign: "middle", color: "var(--color-neutral-400)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" };

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>
        売上・実績
        {back < MAX_MONTHS_BACK ? (
          <Link href={`/stats?m=${monthKeyFromYM(prev.year, prev.month)}`} aria-label="前の月" style={monthNav}>
            <CaretLeft size={13} />
          </Link>
        ) : (
          <span style={{ ...monthNav, opacity: 0.3 }}>
            <CaretLeft size={13} />
          </span>
        )}
        <span style={{ fontSize: 15, color: "var(--color-neutral-500)", margin: "0 8px", verticalAlign: "middle" }}>{`${year}年${month}月`}</span>
        {back > 0 ? (
          <Link href={back === 1 ? "/stats" : `/stats?m=${monthKeyFromYM(next.year, next.month)}`} aria-label="次の月" style={monthNav}>
            <CaretRight size={13} />
          </Link>
        ) : (
          <span style={{ ...monthNav, opacity: 0.3 }}>
            <CaretRight size={13} />
          </span>
        )}
        <span style={{ marginLeft: 8, verticalAlign: "middle" }}>
          <InfoTooltip text="総売上・秘書への支払い・完了件数は、入金日ではなく完了報告を出した（完了した）月で集計しています。秘書への支払いは、窓口ごとの売上からロイヤリティを引いた額の合計です（ロイヤリティ未設定の窓口は含みません）。チャージ金額は依頼主が実際にチャージした額、紹介登録はその月に付けた紹介特典です。行をタップするとその案件トークに移動します。" />
        </span>
      </div>
      <OrgStats orgId={ctx.orgId} orgDisplayName={ctx.orgDisplayName} viewerRole={ctx.role} viewerUserId={ctx.userId} year={year} month={month} isCurrentMonth={back === 0} />
    </div>
  );
}

async function OrgStats({
  orgId,
  orgDisplayName,
  viewerRole,
  viewerUserId,
  year,
  month,
  isCurrentMonth,
}: {
  orgId: string;
  orgDisplayName: string;
  viewerRole: StaffRole | "reception";
  viewerUserId: string;
  year: number;
  month: number;
  isCurrentMonth: boolean;
}) {
  const supabase = await createClient();
  // 選んだ月の範囲（日本時間の1日0時〜翌月1日0時）。チャージ・紹介特典の集計に使う。
  const after = shiftMonth(year, month, 1);
  const monthStartISO = new Date(Date.UTC(year, month - 1, 1) - 9 * 3600 * 1000).toISOString();
  const monthEndISO = new Date(Date.UTC(after.year, after.month - 1, 1) - 9 * 3600 * 1000).toISOString();
  const [
    { data: requests, error },
    { data: departmentRows },
    { data: customerThreads },
    { data: myDepartmentRows },
    { data: ratingRows },
    { data: managerProfiles },
    { data: staffDepartmentRows },
    { data: chargeRows },
    { count: referralCount },
  ] = await Promise.all([
    supabase.from("requests").select("id, title, phase, amount, advance_amount, pay_status, paid_at, completed_at, customer_id, customers(name, staff_label)").eq("org_id", orgId),
    supabase.from("departments").select("id, name, royalty_pct").eq("org_id", orgId).order("created_at", { ascending: true }),
    // 依頼主の窓口は、その依頼主の「customerトーク」が持つ department_id で決まる
    // （customersテーブル自体には窓口の列がない）。
    supabase.from("threads").select("customer_id, department_id").eq("org_id", orgId).eq("kind", "customer"),
    viewerRole === "dept_manager" ? supabase.from("staff_departments").select("department_id").eq("profile_id", viewerUserId) : Promise.resolve({ data: [] as { department_id: string }[] }),
    supabase.from("ratings").select("customer_id, stars, created_at, skipped").eq("skipped", false).not("stars", "is", null),
    // 窓口カードの名前の横に、その窓口の秘書（マネージャー）のアイコンを出す。
    supabase.from("profiles").select("id, avatar_url").eq("org_id", orgId).eq("role", "dept_manager"),
    supabase.from("staff_departments").select("profile_id, department_id"),
    supabase.from("customer_balance_transactions").select("amount").eq("org_id", orgId).eq("kind", "charge").gte("created_at", monthStartISO).lt("created_at", monthEndISO),
    // 取り消した紹介特典は customers 側の記録が消えるので、今付いている分だけを数える。
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("referral_granted_at", monthStartISO).lt("referral_granted_at", monthEndISO),
  ]);

  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>;

  const rows = requests ?? [];
  // 立替の見積もりは実費（advance_amount）を売上に含めず、手数料分だけを計上する。
  function revenueOf(r: (typeof rows)[number]): number {
    return r.amount - (r.advance_amount ?? 0);
  }
  function customerNameOf(r: (typeof rows)[number]): string {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return c?.staff_label ?? c?.name ?? "—";
  }
  const managerAvatarById = new Map((managerProfiles ?? []).map((p) => [p.id, p.avatar_url]));
  const managerAvatarByDepartment = new Map<string, string | null>();
  for (const sd of staffDepartmentRows ?? []) {
    if (managerAvatarById.has(sd.profile_id) && !managerAvatarByDepartment.has(sd.department_id)) {
      managerAvatarByDepartment.set(sd.department_id, managerAvatarById.get(sd.profile_id) ?? null);
    }
  }
  const departmentIdByCustomer = new Map((customerThreads ?? []).map((t) => [t.customer_id, t.department_id]));
  const currentKey = monthKeyFromYM(year, month);
  const currentLabel = `${year}年${month}月`;

  // 今月完了した案件の「完了報告を出したのがスタッフ（dept_leader）だった
  // 場合」はその名前を添える。窓口のマネージャー自身が出した分は、自分の
  // 画面に自分の名前が出ても意味がないので添えない。
  const completedThisMonthIds = rows
    .filter((r) => r.phase === "completed" && r.completed_at && monthKeyJST(r.completed_at) === currentKey)
    .map((r) => r.id);
  const { data: reportRows } =
    completedThisMonthIds.length > 0
      ? await supabase.from("completion_reports").select("request_id, creator_id").in("request_id", completedThisMonthIds)
      : { data: [] as { request_id: string; creator_id: string | null }[] };
  const creatorIdByRequestId = new Map((reportRows ?? []).map((r) => [r.request_id, r.creator_id]));
  const creatorIds = [...new Set((reportRows ?? []).map((r) => r.creator_id).filter((id): id is string => !!id))];
  const { data: creatorProfiles } =
    creatorIds.length > 0 ? await supabase.from("profiles").select("id, role, display_name, staff_alias, avatar_url").in("id", creatorIds) : { data: [] as { id: string; role: StaffRole; display_name: string; staff_alias: string | null; avatar_url: string | null }[] };
  const staffById = new Map(
    (creatorProfiles ?? []).filter((p) => p.role === "dept_leader").map((p) => [p.id, { name: p.staff_alias ?? p.display_name, avatarUrl: p.avatar_url }]),
  );
  function staffFor(requestId: string): { name: string; avatarUrl: string | null } | null {
    const creatorId = creatorIdByRequestId.get(requestId);
    return creatorId ? (staffById.get(creatorId) ?? null) : null;
  }

  // 窓口（マネージャー）ごとに集計する。支払いタイミングは案件によって違う
  // （前払い・着手後払いなど）ので「入金日」基準だと完了件数とずれて分かり
  // にくい。実績としては「完了報告を出した（＝完了した）月」を基準に、
  // その月に完了した案件の金額を積み上げる。累計ではなく「今月」だけを
  // 見せる（過去の月を遡って見る機能は今のところ無い）。
  const monthRatings = (ratingRows ?? []).filter((r) => monthKeyJST(r.created_at) === currentKey);

  function buildStat(matchDeptId: string | null, id: string, name: string, royaltyPct: number | null): DepartmentStat {
    const deptRows = rows.filter((r) => (departmentIdByCustomer.get(r.customer_id) ?? null) === matchDeptId);
    const deptRatings = monthRatings.filter((r) => (departmentIdByCustomer.get(r.customer_id) ?? null) === matchDeptId);
    const monthRatingCount = deptRatings.length;
    const monthRatingAvg = monthRatingCount > 0 ? deptRatings.reduce((s, r) => s + (r.stars ?? 0), 0) / monthRatingCount : null;

    const completedThisMonth: MonthRow[] = [];
    let monthRevenue = 0;
    for (const r of deptRows) {
      if (r.phase === "completed" && r.completed_at && monthKeyJST(r.completed_at) === currentKey) {
        completedThisMonth.push({ requestId: r.id, customerName: customerNameOf(r), title: r.title, amount: revenueOf(r), status: "paid", staff: staffFor(r.id) });
        monthRevenue += revenueOf(r);
      }
    }
    // 未入金の行は「今」の状態なので、今月を見ているときだけ出す。
    const pendingRows: MonthRow[] = !isCurrentMonth
      ? []
      : deptRows
      .filter((r) => r.pay_status !== "paid" && !["draft", "cancelled", "declined"].includes(r.phase))
      .map((r) => ({ requestId: r.id, customerName: customerNameOf(r), title: r.title, amount: revenueOf(r), status: "pending" as const, staff: null }))
      .filter((r) => r.amount > 0);

    const months: MonthBreakdown[] = [{ key: currentKey, label: currentLabel, rows: [...pendingRows, ...completedThisMonth] }];

    const avatarUrl = matchDeptId ? (managerAvatarByDepartment.get(matchDeptId) ?? null) : null;
    return { id, name, avatarUrl, royaltyPct, monthRatingAvg, monthRatingCount, monthCompleted: completedThisMonth.length, monthRevenue, months };
  }

  // マネージャーは自分の窓口だけ、オーナーは全窓口（＋窓口未設定分、
  // 実績がある時だけ）を見る。
  const myDepartmentIds = new Set((myDepartmentRows ?? []).map((d) => d.department_id));
  const visibleDepartments = viewerRole === "dept_manager" ? (departmentRows ?? []).filter((d) => myDepartmentIds.has(d.id)) : (departmentRows ?? []);
  const stats: DepartmentStat[] = visibleDepartments.map((d) => buildStat(d.id, d.id, d.name, d.royalty_pct));

  if (viewerRole !== "dept_manager") {
    const unassigned = buildStat(null, "unassigned", orgDisplayName, null);
    if (unassigned.monthRevenue > 0 || unassigned.monthRatingCount > 0 || unassigned.monthCompleted > 0 || unassigned.months.some((m) => m.rows.length > 0)) {
      stats.push(unassigned);
    }
  }

  const grandMonthRevenue = stats.reduce((s, d) => s + d.monthRevenue, 0);
  // 秘書への支払い＝窓口ごとの売上 − ロイヤリティ（ロイヤリティ未設定の窓口と、
  // 窓口の無い本部直の分は含めない）。
  const grandPayout = stats.reduce((s, d) => (d.royaltyPct != null ? s + d.monthRevenue - Math.round((d.monthRevenue * d.royaltyPct) / 100) : s), 0);
  const monthCharges = (chargeRows ?? []).reduce((s, r) => s + r.amount, 0);
  const monthReferrals = referralCount ?? 0;
  const grandMonthCompleted = stats.reduce((s, d) => s + d.monthCompleted, 0);
  const grandRatingCount = stats.reduce((s, d) => s + d.monthRatingCount, 0);
  const grandRatingSum = stats.reduce((s, d) => s + (d.monthRatingAvg ?? 0) * d.monthRatingCount, 0);
  const grandRatingAvg = grandRatingCount > 0 ? grandRatingSum / grandRatingCount : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatTile label="総売上" value={yen(grandMonthRevenue)} />
        <StatTile label="完了件数" value={`${grandMonthCompleted}件`} />
        <StatTile label="チャージ金額" value={yen(monthCharges)} />
        <StatTile label="紹介登録" value={monthReferrals > 0 ? `${monthReferrals}人・${yen(monthReferrals * REFERRAL_CREDIT)}` : "0人"} />
        <StatTile label="秘書への支払い" value={yen(grandPayout)} />
        <StatTile label="評価" small value={grandRatingCount > 0 ? `★${grandRatingAvg?.toFixed(1)}（${grandRatingCount}件）` : "まだありません"} />
      </div>

      <DepartmentStatsList departments={stats} canEditRoyalty={viewerRole === "owner"} />
    </>
  );
}

// small：スマホでは文字を小さくして、長い値（「まだありません」など）が切れないようにする。
function StatTile({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ minWidth: 0, padding: "12px 10px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div className={small ? "vid-stat-small" : undefined} style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 17, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}
