import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { previewMessage } from "@/lib/message-preview";
import { staffSenderLabel } from "@/lib/roles";
import StaffChat from "@/components/StaffChat";
import type { StaffRole } from "@/lib/supabase/types";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  // オーナーはスタッフの管理（招待・役職変更・削除・窓口管理）ができる。
  // マネージャーは一覧を見てスタッフとチャットできるだけ（管理操作は不可）。
  // マネージャーの一覧には他のマネージャー・オーナーは含めない
  // （マネージャーが実際にやり取りする相手はスタッフだけのため）。
  const canAdmin = ctx.role === "owner";
  const canBrowseStaff = ctx.role === "owner" || ctx.role === "dept_manager";
  const rosterRoles: StaffRole[] = ctx.role === "dept_manager" ? ["dept_leader"] : ["owner", "dept_manager", "dept_leader"];
  const supabase = await createClient();
  const [{ data: departments }, { data: profiles }, { data: staffDepartments }, { data: menus }, { data: summaries }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, display_name, staff_alias")
      .eq("org_id", ctx.orgId)
      .in("role", rosterRoles)
      .order("created_at", { ascending: true }),
    supabase.from("staff_departments").select("profile_id, department_id"),
    supabase.from("menus").select("id, label, department_id").eq("org_id", ctx.orgId).order("sort", { ascending: true }),
    supabase.rpc("staff_thread_summaries", { p_org_id: ctx.orgId }),
  ]);

  const departmentIdsByProfile = new Map<string, string[]>();
  for (const row of staffDepartments ?? []) {
    const list = departmentIdsByProfile.get(row.profile_id) ?? [];
    list.push(row.department_id);
    departmentIdsByProfile.set(row.profile_id, list);
  }

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

  const staff = (profiles ?? []).map((p) => {
    const summary = summaryByProfileId.get(p.id) ?? null;
    return {
      id: p.id,
      displayName: p.staff_alias ?? p.display_name,
      role: p.role as StaffRole,
      departmentIds: departmentIdsByProfile.get(p.id) ?? [],
      lastMessagePreview: previewFor(summary),
      unread: summary?.unread ?? false,
    };
  });

  // マネージャーの一覧に出す「本部」自身の枠（自分のスレッドの最終メッセージ・未読）。
  const selfSummary = !canAdmin ? (summaryByProfileId.get(ctx.userId) ?? null) : null;
  const selfEntry = !canAdmin ? { lastMessagePreview: previewFor(selfSummary), unread: selfSummary?.unread ?? false } : undefined;

  return (
    <StaffChat
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      orgId={ctx.orgId}
      canAdmin={canAdmin}
      canBrowseStaff={canBrowseStaff}
      staff={staff}
      selfEntry={selfEntry}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      menus={(menus ?? []).map((m) => ({ id: m.id, label: m.label, departmentId: m.department_id }))}
    />
  );
}
