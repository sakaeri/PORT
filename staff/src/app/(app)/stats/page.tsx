import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import type { MonthBreakdown, MonthRow } from "@/components/MonthlyMenuBreakdown";
import DepartmentStatsList, { type DepartmentStat } from "@/components/DepartmentStatsList";
import type { StaffRole } from "@/lib/supabase/types";

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

function monthKeyFromYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default async function StatsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // スタッフ（dept_leader）は依頼主とは直接やり取りしない役割で、
  // 売上・実績も見せない。直接URLで来ても弾く。
  if (ctx.role === "dept_leader") return null;

  const { year, month } = nowJSTYearMonth();

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>
        売上・実績　<span style={{ fontSize: 15, color: "var(--color-neutral-500)" }}>{`${year}年${month}月`}</span>
      </div>
      {ctx.isHq ? <HqStats /> : <OrgStats orgId={ctx.orgId} orgDisplayName={ctx.orgDisplayName} viewerRole={ctx.role} viewerUserId={ctx.userId} />}
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

async function OrgStats({ orgId, orgDisplayName, viewerRole, viewerUserId }: { orgId: string; orgDisplayName: string; viewerRole: StaffRole | "reception"; viewerUserId: string }) {
  const supabase = await createClient();
  const [{ data: requests, error }, { data: departmentRows }, { data: customerThreads }, { data: myDepartmentRows }, { data: ratingRows }, { data: managerProfiles }, { data: staffDepartmentRows }] = await Promise.all([
    supabase.from("requests").select("id, title, phase, amount, pay_status, paid_at, completed_at, customer_id, customers(name, staff_label)").eq("org_id", orgId),
    supabase.from("departments").select("id, name, royalty_pct").eq("org_id", orgId).order("created_at", { ascending: true }),
    // 依頼主の窓口は、その依頼主の「customerトーク」が持つ department_id で決まる
    // （customersテーブル自体には窓口の列がない）。
    supabase.from("threads").select("customer_id, department_id").eq("org_id", orgId).eq("kind", "customer"),
    viewerRole === "dept_manager" ? supabase.from("staff_departments").select("department_id").eq("profile_id", viewerUserId) : Promise.resolve({ data: [] as { department_id: string }[] }),
    supabase.from("ratings").select("customer_id, stars, created_at, skipped").eq("skipped", false).not("stars", "is", null),
    // 窓口カードの名前の横に、その窓口の秘書（マネージャー）のアイコンを出す。
    supabase.from("profiles").select("id, avatar_url").eq("org_id", orgId).eq("role", "dept_manager"),
    supabase.from("staff_departments").select("profile_id, department_id"),
  ]);

  if (error) return <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>;

  const rows = requests ?? [];
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
  const { year, month } = nowJSTYearMonth();
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
        completedThisMonth.push({ requestId: r.id, customerName: customerNameOf(r), title: r.title, amount: r.amount, status: "paid", staff: staffFor(r.id) });
        monthRevenue += r.amount;
      }
    }
    const pendingRows: MonthRow[] = deptRows
      .filter((r) => r.pay_status !== "paid" && !["draft", "cancelled", "declined"].includes(r.phase))
      .map((r) => ({ requestId: r.id, customerName: customerNameOf(r), title: r.title, amount: r.amount, status: "pending" as const, staff: null }))
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
  const grandMonthCompleted = stats.reduce((s, d) => s + d.monthCompleted, 0);
  const grandRatingCount = stats.reduce((s, d) => s + d.monthRatingCount, 0);
  const grandRatingSum = stats.reduce((s, d) => s + (d.monthRatingAvg ?? 0) * d.monthRatingCount, 0);
  const grandRatingAvg = grandRatingCount > 0 ? grandRatingSum / grandRatingCount : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatTile label="今月の実績金額" value={yen(grandMonthRevenue)} />
        <StatTile label="今月の完了件数" value={`${grandMonthCompleted}件`} />
        <StatTile label="今月の評価" value={grandRatingCount > 0 ? `★${grandRatingAvg?.toFixed(1)}（${grandRatingCount}件）` : "まだありません"} />
      </div>

      <DepartmentStatsList departments={stats} canEditRoyalty={viewerRole === "owner"} />

      <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>
        実績金額は、入金日ではなく完了報告を出した（完了した）月を基準に集計しています。行をタップするとその案件トークに移動します。
      </div>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, padding: "12px 10px", borderRadius: "var(--radius-md)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 10.5, color: "var(--color-neutral-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 17, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
