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
  const [{ data: menus }, { data: templates }, { data: org }, { data: desks }, { data: departments }, { data: referralSources }, { data: referredCustomers }, { data: deskThreads }] = await Promise.all([
    supabase
      .from("menus")
      .select("*, report_field_presets(*)")
      .eq("org_id", ctx.orgId)
      .order("last_used_at", { ascending: false })
      .order("sort", { ascending: true }),
    supabase
      .from("intake_forms")
      .select("*, intake_fields(*)")
      .eq("org_id", ctx.orgId)
      .order("last_used_at", { ascending: false })
      .order("sort", { ascending: true }),
    supabase.from("organizations").select("terms_content").eq("id", ctx.orgId).maybeSingle(),
    supabase.from("inquiry_desks").select("id, name, slug, active, department_id, created_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").eq("org_id", ctx.orgId).order("created_at", { ascending: true }),
    supabase.from("referral_sources").select("id, name, active, created_at").eq("org_id", ctx.orgId),
    supabase
      .from("customers")
      .select("id, name, staff_label, referral_source_id, referral_granted_at")
      .eq("org_id", ctx.orgId)
      .not("referral_source_id", "is", null)
      .order("referral_granted_at", { ascending: false }),
    // 窓口ごとの最後の問い合わせ日時を出すため。
    supabase.from("threads").select("desk_id, last_msg_at").eq("org_id", ctx.orgId).eq("kind", "customer").not("desk_id", "is", null),
  ]);
  const customersBySource = new Map<string, { id: string; label: string }[]>();
  for (const c of referredCustomers ?? []) {
    const list = customersBySource.get(c.referral_source_id!) ?? [];
    list.push({ id: c.id, label: c.staff_label ?? c.name });
    customersBySource.set(c.referral_source_id!, list);
  }

  // 窓口・紹介元は、最近動いたもの（作ったばかりのものを含む）を上に、オフ・非表示は下に。
  const lastDeskMessageAt = new Map<string, string>();
  for (const t of deskThreads ?? []) {
    if (t.desk_id && t.last_msg_at && t.last_msg_at > (lastDeskMessageAt.get(t.desk_id) ?? "")) lastDeskMessageAt.set(t.desk_id, t.last_msg_at);
  }
  const lastReferralAt = new Map<string, string>();
  for (const c of referredCustomers ?? []) {
    if (c.referral_granted_at && c.referral_granted_at > (lastReferralAt.get(c.referral_source_id!) ?? "")) lastReferralAt.set(c.referral_source_id!, c.referral_granted_at);
  }
  const sortedDesks = byRecentActivity(desks ?? [], (d) => latest(d.created_at, lastDeskMessageAt.get(d.id)));
  const sortedSources = byRecentActivity(referralSources ?? [], (s) => latest(s.created_at, lastReferralAt.get(s.id)));

  return (
    <MenuSettings
      orgId={ctx.orgId}
      initialMenus={(menus ?? []).map((m) => ({
        ...m,
        report_field_presets: (m.report_field_presets ?? []).sort((a, b) => a.sort - b.sort),
      }))}
      initialTemplates={(templates ?? []).map((t) => ({ ...t, intake_fields: (t.intake_fields ?? []).sort((a, b) => a.sort - b.sort) }))}
      initialTermsContent={org?.terms_content?.trim() ? org.terms_content : DEFAULT_TERMS_CONTENT}
      initialDesks={sortedDesks}
      initialReferralSources={sortedSources.map((s) => ({ ...s, customers: customersBySource.get(s.id) ?? [] }))}
      departments={departments ?? []}
      canEdit={ctx.role === "owner"}
    />
  );
}

function latest(a: string, b: string | undefined): string {
  return b && b > a ? b : a;
}

function byRecentActivity<T extends { active: boolean }>(rows: T[], at: (row: T) => string): T[] {
  return rows.slice().sort((a, b) => Number(b.active) - Number(a.active) || at(b).localeCompare(at(a)));
}
