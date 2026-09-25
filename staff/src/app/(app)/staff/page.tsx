import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { previewMessage } from "@/lib/message-preview";
import StaffChat from "@/components/StaffChat";
import type { StaffRole } from "@/lib/supabase/types";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const canManage = ctx.role === "owner";
  const supabase = await createClient();
  const [{ data: departments }, { data: profiles }, { data: staffDepartments }, { data: menus }, { data: summaries }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, display_name")
      .eq("org_id", ctx.orgId)
      .in("role", ["owner", "dept_manager", "dept_leader"])
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

  const summaryByProfileId = new Map((summaries ?? []).map((s) => [s.staff_profile_id, s]));

  const staff = (profiles ?? []).map((p) => {
    const summary = summaryByProfileId.get(p.id) ?? null;
    const lastMessagePreview =
      summary && summary.last_message_kind != null
        ? previewMessage({ kind: summary.last_message_kind, body: summary.last_message_body, payload: summary.last_message_payload, deleted_at: summary.last_message_deleted_at })
        : null;
    return {
      id: p.id,
      displayName: p.display_name,
      role: p.role as StaffRole,
      departmentIds: departmentIdsByProfile.get(p.id) ?? [],
      lastMessagePreview,
      unread: summary?.unread ?? false,
    };
  });

  return (
    <StaffChat
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      orgId={ctx.orgId}
      canManage={canManage}
      staff={staff}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      menus={(menus ?? []).map((m) => ({ id: m.id, label: m.label, departmentId: m.department_id }))}
    />
  );
}
