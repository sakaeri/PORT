import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import StaffChat from "@/components/StaffChat";
import type { StaffRole } from "@/lib/supabase/types";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const [{ data: departments }, { data: staff }, { data: menus }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, department_id, display_name")
      .eq("org_id", ctx.orgId)
      .in("role", ["owner", "supervisor", "dept_manager", "dept_leader"])
      .order("created_at", { ascending: true }),
    supabase.from("menus").select("id, label, department_id").eq("org_id", ctx.orgId).order("sort", { ascending: true }),
  ]);

  // メールアドレスはauth.users側にしかないので、Admin APIでスタッフの
  // 人数分だけ引く。
  const admin = createServiceRoleClient();
  const staffWithEmail = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data } = await admin.auth.admin.getUserById(s.id);
      return { id: s.id, role: s.role as StaffRole, departmentId: s.department_id, displayName: s.display_name, email: data.user?.email ?? "" };
    }),
  );

  const canManage = ctx.role === "owner" || ctx.role === "supervisor";
  const staffList = staffWithEmail.filter((s) => s.id !== ctx.userId).map((s) => ({ id: s.id, displayName: s.displayName }));

  return (
    <StaffChat
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      orgId={ctx.orgId}
      canManage={canManage}
      staffList={staffList}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      staffRows={staffWithEmail}
      menus={(menus ?? []).map((m) => ({ id: m.id, label: m.label, departmentId: m.department_id }))}
    />
  );
}
