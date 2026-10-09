import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { previewMessage } from "@/lib/message-preview";
import { staffSenderLabel } from "@/lib/roles";
import StaffChat from "@/components/StaffChat";
import type { StaffRole } from "@/lib/supabase/types";

// JSTでの「今月」の開始・終了（UTCのタイムスタンプ比較用）。日本には
// サマータイムが無いので固定オフセット（+9時間）でよい。
function jstMonthRange(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const start = new Date(Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  // マネージャー（と本部）はスタッフの管理（招待・役職変更・削除）ができる。
  // マネージャーの一覧には他のマネージャー・オーナーは含めない
  // （マネージャーが実際にやり取りする相手はスタッフだけのため）。
  const canAdmin = ctx.role === "owner" || ctx.role === "dept_manager";
  const canBrowseStaff = canAdmin;
  const rosterRoles: StaffRole[] = ctx.role === "dept_manager" ? ["dept_leader"] : ["owner", "dept_manager", "dept_leader"];
  const supabase = await createClient();
  const { start: monthStart, end: monthEnd } = jstMonthRange();
  const [{ data: departments }, { data: profiles }, { data: staffDepartments }, { data: summaries }, { data: reportRows }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, display_name, staff_alias, avatar_url")
      .eq("org_id", ctx.orgId)
      .in("role", rosterRoles)
      .order("created_at", { ascending: true }),
    supabase.from("staff_departments").select("profile_id, department_id"),
    supabase.rpc("staff_thread_summaries", { p_org_id: ctx.orgId }),
    // スタッフの「業績」は今のところ、今月に完了報告を提出した件数だけを見せる
    // （報告を出した人＝creator_idで1件とカウント。payoutのような金額的な
    // 取り分の概念はスタッフには無いので、シンプルな件数に留める）。
    supabase
      .from("completion_reports")
      .select("creator_id, requests!inner(org_id)")
      .eq("requests.org_id", ctx.orgId)
      .gte("submitted_at", monthStart)
      .lt("submitted_at", monthEnd),
  ]);

  const reportCountByCreator = new Map<string, number>();
  for (const r of reportRows ?? []) {
    if (!r.creator_id) continue;
    reportCountByCreator.set(r.creator_id, (reportCountByCreator.get(r.creator_id) ?? 0) + 1);
  }

  const departmentIdsByProfile = new Map<string, string[]>();
  for (const row of staffDepartments ?? []) {
    const list = departmentIdsByProfile.get(row.profile_id) ?? [];
    list.push(row.department_id);
    departmentIdsByProfile.set(row.profile_id, list);
  }
  const myDepartmentIds = departmentIdsByProfile.get(ctx.userId) ?? [];

  type Summary = NonNullable<typeof summaries>[number];
  const summaryByProfileId = new Map((summaries ?? []).map((s) => [s.staff_profile_id, s]));

  function previewFor(summary: Summary | null) {
    return summary && summary.last_message_kind != null
      ? previewMessage(
          { kind: summary.last_message_kind, body: summary.last_message_body, payload: summary.last_message_payload, deleted_at: summary.last_message_deleted_at },
          staffSenderLabel(summary.last_message_sender_role),
        )
      : null;
  }

  // マネージャーの一覧には「自分に割り当てられているスタッフ」だけを出す
  // （本部が割り当てたスタッフも含む・他のマネージャーのスタッフは含まない）。
  const visibleProfiles = (profiles ?? []).filter(
    (p) => ctx.role !== "dept_manager" || p.role !== "dept_leader" || (departmentIdsByProfile.get(p.id) ?? []).some((id) => myDepartmentIds.includes(id)),
  );

  const staff = visibleProfiles.map((p) => {
    const summary = summaryByProfileId.get(p.id) ?? null;
    return {
      id: p.id,
      displayName: p.staff_alias ?? p.display_name,
      avatarUrl: p.avatar_url,
      role: p.role as StaffRole,
      departmentIds: departmentIdsByProfile.get(p.id) ?? [],
      threadId: summary?.thread_id ?? null,
      archived: summary?.archived ?? false,
      lastMessagePreview: previewFor(summary),
      unread: summary?.unread ?? false,
      monthlyReportCount: reportCountByCreator.get(p.id) ?? 0,
    };
  });

  // マネージャーの一覧に出す「本部」自身の枠（自分のスレッドの最終メッセージ・未読）。
  const isManager = ctx.role === "dept_manager";
  const selfSummary = isManager ? (summaryByProfileId.get(ctx.userId) ?? null) : null;
  const selfEntry = isManager ? { lastMessagePreview: previewFor(selfSummary), unread: selfSummary?.unread ?? false } : undefined;

  return (
    <StaffChat
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      orgId={ctx.orgId}
      orgDisplayName={ctx.orgDisplayName}
      canAdmin={canAdmin}
      canBrowseStaff={canBrowseStaff}
      staff={staff}
      selfEntry={selfEntry}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      myDepartmentIds={myDepartmentIds}
    />
  );
}
