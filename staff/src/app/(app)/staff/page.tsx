import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import StaffAdmin from "@/components/StaffAdmin";
import type { StaffRole } from "@/lib/supabase/types";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const [{ data: departments }, { data: staff }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, department_id, display_name")
      .eq("org_id", ctx.orgId)
      .in("role", ["owner", "supervisor", "dept_manager", "dept_leader"])
      .order("created_at", { ascending: true }),
  ]);

  // メールアドレスはauth.users側にしかないので、Admin APIでスタッフの人数分だけ引く。
  const admin = createServiceRoleClient();
  const staffWithEmail = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data } = await admin.auth.admin.getUserById(s.id);
      return { id: s.id, role: s.role as StaffRole, departmentId: s.department_id, displayName: s.display_name, email: data.user?.email ?? "" };
    }),
  );

  return (
    <StaffAdmin
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      staff={staffWithEmail}
    />
  );
}
