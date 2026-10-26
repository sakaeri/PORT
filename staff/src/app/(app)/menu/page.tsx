import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { DEFAULT_TERMS_CONTENT } from "@/lib/terms";
import MenuSettings from "@/components/MenuSettings";

export default async function MenuSettingsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  // メニュー管理は本部（オーナー）専用。秘書・スタッフが直接URLで来ても出さない
  // （返信テンプレの作成・編集は、秘書はトークのテンプレ画面から行う）。
  if (ctx.role !== "owner" && ctx.role !== "reception") redirect("/today");

  const supabase = await createClient();
  const [{ data: menus }, { data: templates }, { data: org }, { data: desks }, { data: departments }] = await Promise.all([
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
    supabase.from("organizations").select("terms_content").eq("id", ctx.orgId).maybeSingle(),
    supabase.from("inquiry_desks").select("id, name, slug, active, department_id, created_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
  ]);

  return (
    <MenuSettings
      orgId={ctx.orgId}
      initialMenus={(menus ?? []).map((m) => ({
        ...m,
        report_field_presets: (m.report_field_presets ?? []).sort((a, b) => a.sort - b.sort),
      }))}
      initialTemplates={(templates ?? []).map((t) => ({ ...t, intake_fields: (t.intake_fields ?? []).sort((a, b) => a.sort - b.sort) }))}
      initialTermsContent={org?.terms_content?.trim() ? org.terms_content : DEFAULT_TERMS_CONTENT}
      initialDesks={desks ?? []}
      departments={departments ?? []}
      canEdit={ctx.role === "owner"}
    />
  );
}
