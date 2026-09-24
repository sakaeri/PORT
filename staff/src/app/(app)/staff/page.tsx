import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { listStaffInvites } from "@/app/actions";
import StaffChat from "@/components/StaffChat";
import type { StaffRole } from "@/lib/supabase/types";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const canManage = ctx.role === "owner" || ctx.role === "supervisor";
  const supabase = await createClient();
  const [{ data: departments }, { data: profiles }, { data: staffDepartments }, { data: menus }, invites] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, display_name")
      .eq("org_id", ctx.orgId)
      .in("role", ["owner", "supervisor", "dept_manager", "dept_leader"])
      .order("created_at", { ascending: true }),
    supabase.from("staff_departments").select("profile_id, department_id"),
    supabase.from("menus").select("id, label, department_id").eq("org_id", ctx.orgId).order("sort", { ascending: true }),
    canManage ? listStaffInvites() : Promise.resolve([]),
  ]);

  const departmentIdsByProfile = new Map<string, string[]>();
  for (const row of staffDepartments ?? []) {
    const list = departmentIdsByProfile.get(row.profile_id) ?? [];
    list.push(row.department_id);
    departmentIdsByProfile.set(row.profile_id, list);
  }

  const staff = (profiles ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    role: p.role as StaffRole,
    departmentIds: departmentIdsByProfile.get(p.id) ?? [],
  }));

  return (
    <StaffChat
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      orgId={ctx.orgId}
      canManage={canManage}
      staff={staff}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      menus={(menus ?? []).map((m) => ({ id: m.id, label: m.label, departmentId: m.department_id }))}
      pendingInvites={invites.map((i) => ({ id: i.id, role: i.role as StaffRole, departmentIds: i.department_ids }))}
    />
  );
}
