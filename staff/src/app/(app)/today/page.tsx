import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import PrintButton from "@/components/PrintButton";

function yen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

// JSTでの「明日0時」（UTCのタイムスタンプ比較用）。日本にはサマータイムが
// 無いので固定オフセット（+9時間）でよい。
function jstTomorrowStartISO(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(year, month - 1, day + 1) - 9 * 60 * 60 * 1000).toISOString();
}

function jstTodayLabel(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" }).formatToParts(new Date());
  return parts.map((p) => p.value).join("");
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  textDecoration: "none",
  color: "inherit",
};

const sectionHeader: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: headingWeight,
  fontSize: 12.5,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  padding: "6px 12px",
  borderRadius: "var(--radius-md)",
};

export default async function TodayPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // スタッフ（dept_leader）は依頼主とは直接やり取りしない役割。売上・実績と
  // 同じ扱いで隠す。
  if (ctx.role === "dept_leader") return null;

  const supabase = await createClient();
  const tomorrowStart = jstTomorrowStartISO();

  const [{ data: dueRows }, { data: customerThreads }, { data: myDepartmentRows }, { data: pendingReportRows }, { data: quotedRows }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, due_at, customer_id, customers(name)")
      .eq("org_id", ctx.orgId)
      .eq("phase", "started")
      .not("due_at", "is", null)
      .lt("due_at", tomorrowStart)
      .order("due_at", { ascending: true }),
    supabase.from("threads").select("customer_id, department_id").eq("org_id", ctx.orgId).eq("kind", "customer"),
    ctx.role === "dept_manager" ? supabase.from("staff_departments").select("department_id").eq("profile_id", ctx.userId) : Promise.resolve({ data: [] as { department_id: string }[] }),
    supabase
      .from("completion_reports")
      .select("request_id, submitted_at, requests!inner(id, title, customer_id, customers(name), org_id)")
      .is("sent_at", null)
      .eq("requests.org_id", ctx.orgId),
    supabase
      .from("requests")
      .select("id, title, amount, quoted_at, customer_id, customers(name)")
      .eq("org_id", ctx.orgId)
      .eq("phase", "quoted")
      .order("quoted_at", { ascending: true }),
  ]);

  const viewerRole = ctx.role;
  const departmentIdByCustomer = new Map((customerThreads ?? []).map((t) => [t.customer_id, t.department_id]));
  const myDepartmentIds = new Set((myDepartmentRows ?? []).map((d) => d.department_id));
  function visibleToViewer(customerId: string): boolean {
    if (viewerRole !== "dept_manager") return true;
    const deptId = departmentIdByCustomer.get(customerId);
    return !!deptId && myDepartmentIds.has(deptId);
  }
  function customerNameOf(c: { name: string } | { name: string }[] | null): string {
    const row = Array.isArray(c) ? c[0] : c;
    return row?.name ?? "—";
  }

  const dueList = (dueRows ?? []).filter((r) => visibleToViewer(r.customer_id));

  // 期限の案件に、スタッフ（担当者）が割り当てられていればその名前を添える。
  const dueIds = dueList.map((r) => r.id);
  const { data: caseStaffRows } =
    dueIds.length > 0
      ? await supabase.from("case_staff").select("request_id, profiles!case_staff_profile_id_fkey(display_name, staff_alias)").in("request_id", dueIds)
      : { data: [] as { request_id: string; profiles: { display_name: string; staff_alias: string | null } | { display_name: string; staff_alias: string | null }[] | null }[] };
  const staffNamesByRequestId = new Map<string, string>();
  for (const row of caseStaffRows ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile) continue;
    const name = profile.staff_alias ?? profile.display_name;
    const existing = staffNamesByRequestId.get(row.request_id);
    staffNamesByRequestId.set(row.request_id, existing ? `${existing}・${name}` : name);
  }

  const pendingReports = (pendingReportRows ?? [])
    .map((r) => {
      const req = Array.isArray(r.requests) ? r.requests[0] : r.requests;
      return req ? { requestId: req.id, title: req.title, customerId: req.customer_id, customerName: customerNameOf(req.customers), submittedAt: r.submitted_at } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => visibleToViewer(r.customerId));

  const quotedList = (quotedRows ?? []).filter((r) => visibleToViewer(r.customer_id));

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 700, width: "100%", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>今日やること</div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>{jstTodayLabel()}</div>
        </div>
        <PrintButton />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={sectionHeader}>今日が期限の案件（期限超過含む）</div>
        {dueList.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>ありません。</div>
        ) : (
          dueList.map((r) => (
            <Link key={r.id} href={`/cases/${r.id}`} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="print-checkbox">☑</span>
                <span style={{ flex: "none", fontSize: 12, color: "var(--color-neutral-500)" }}>{customerNameOf(r.customers)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                <span style={{ flex: "none", fontSize: 11.5, color: r.due_at! < new Date().toISOString() ? "var(--color-accent-200)" : "var(--color-neutral-500)" }}>
                  期限 {fmtTime(r.due_at!)}
                </span>
              </div>
              {staffNamesByRequestId.get(r.id) && (
                <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>担当：{staffNamesByRequestId.get(r.id)}</div>
              )}
            </Link>
          ))
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={sectionHeader}>秘書の確認待ちの完了報告</div>
        {pendingReports.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>ありません。</div>
        ) : (
          pendingReports.map((r) => (
            <Link key={r.requestId} href={`/cases/${r.requestId}`} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="print-checkbox">☑</span>
                <span style={{ flex: "none", fontSize: 12, color: "var(--color-neutral-500)" }}>{r.customerName}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                <span style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>提出 {fmtTime(r.submittedAt)}</span>
              </div>
            </Link>
          ))
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={sectionHeader}>返信待ちの見積もり</div>
        {quotedList.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)" }}>ありません。</div>
        ) : (
          quotedList.map((r) => (
            <Link key={r.id} href={`/cases/${r.id}`} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="print-checkbox">☑</span>
                <span style={{ flex: "none", fontSize: 12, color: "var(--color-neutral-500)" }}>{customerNameOf(r.customers)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                <span style={{ flex: "none", fontSize: 13, fontFamily: "var(--font-heading)" }}>{yen(r.amount)}</span>
              </div>
              {r.quoted_at && <div style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>送信 {fmtTime(r.quoted_at)}</div>}
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
