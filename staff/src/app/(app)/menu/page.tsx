import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import MenuSettings from "@/components/MenuSettings";

export default async function MenuSettingsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // スタッフ（dept_leader）は依頼主とは直接やり取りしない役割で、
  // メニューや会社設定も編集させない。直接URLで来ても弾く。
  if (ctx.role === "dept_leader") return null;

  const supabase = await createClient();
  const [{ data: menus }, { data: templates }] = await Promise.all([
    supabase
      .from("menus")
      .select("*, report_field_presets(*)")
      .eq("org_id", ctx.orgId)
      .order("sort", { ascending: true }),
    supabase
      .from("intake_forms")
      .select("*, intake_fields(*)")
      .eq("org_id", ctx.orgId)
      .order("sort", { ascending: true }),
  ]);

  return (
    <MenuSettings
      orgId={ctx.orgId}
      initialMenus={(menus ?? []).map((m) => ({
        ...m,
        report_field_presets: (m.report_field_presets ?? []).sort((a, b) => a.sort - b.sort),
      }))}
      initialTemplates={(templates ?? []).map((t) => ({ ...t, intake_fields: (t.intake_fields ?? []).sort((a, b) => a.sort - b.sort) }))}
      canEdit={ctx.role === "owner"}
    />
  );
}
