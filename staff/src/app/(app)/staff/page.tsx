import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import StaffAdmin from "@/components/StaffAdmin";
import type { StaffRole } from "@/lib/supabase/types";

export default async function StaffPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // 制作者はナビゲーション自体を隠しているが、直接URLで来ても弾く。
  if (ctx.role === "creator") return null;

  const supabase = await createClient();
  const [{ data: departments }, { data: staff }, { data: creators }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, role, department_id, display_name")
      .eq("org_id", ctx.orgId)
      .in("role", ["owner", "supervisor", "dept_manager", "dept_leader"])
      .order("created_at", { ascending: true }),
    supabase
      .from("creators")
      .select("id, profile_id, bio, wip_limit, profiles!creators_profile_id_fkey(display_name)")
      .eq("org_id", ctx.orgId)
      .order("joined_on", { ascending: true }),
  ]);

  // メールアドレスはauth.users側にしかないので、Admin APIでスタッフ・制作者の
  // 人数分だけ引く。
  const admin = createServiceRoleClient();
  const staffWithEmail = await Promise.all(
    (staff ?? []).map(async (s) => {
      const { data } = await admin.auth.admin.getUserById(s.id);
      return { id: s.id, role: s.role as StaffRole, departmentId: s.department_id, displayName: s.display_name, email: data.user?.email ?? "" };
    }),
  );
  const creatorsWithEmail = await Promise.all(
    (creators ?? []).map(async (c) => {
      const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
      const { data } = await admin.auth.admin.getUserById(c.profile_id);
      return {
        id: c.id,
        profileId: c.profile_id,
        displayName: profile?.display_name ?? "",
        email: data.user?.email ?? "",
        bio: c.bio,
        wipLimit: c.wip_limit,
      };
    }),
  );

  return (
    <StaffAdmin
      currentUserId={ctx.userId}
      currentRole={ctx.role}
      departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
      staff={staffWithEmail}
      creators={creatorsWithEmail}
    />
  );
}
