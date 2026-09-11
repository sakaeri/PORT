import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import MenuSettings from "@/components/MenuSettings";

export default async function MenuSettingsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const [{ data: org }, { data: menus }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, display_name, rep_name, address, tel, email")
      .eq("id", ctx.orgId)
      .single(),
    supabase
      .from("menus")
      .select("*, menu_questions(*)")
      .eq("org_id", ctx.orgId)
      .order("sort", { ascending: true }),
  ]);

  return (
    <MenuSettings
      orgId={ctx.orgId}
      initialCompany={{
        name: org?.name ?? "",
        display_name: org?.display_name ?? "",
        rep_name: org?.rep_name ?? "",
        address: org?.address ?? "",
        tel: org?.tel ?? "",
        email: org?.email ?? "",
      }}
      initialMenus={(menus ?? []).map((m) => ({ ...m, menu_questions: (m.menu_questions ?? []).sort((a, b) => a.sort - b.sort) }))}
    />
  );
}
