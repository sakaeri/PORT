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
  const [{ data: org }, { data: menus }, { data: templates }, { data: policy }, { data: userData }, { data: cardPaymentLinks }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, display_name, rep_name, address, tel, email, slug, card_payment_enabled, bank_transfer_info")
      .eq("id", ctx.orgId)
      .single(),
    supabase
      .from("menus")
      .select("*, menu_questions(*)")
      .eq("org_id", ctx.orgId)
      .order("sort", { ascending: true }),
    supabase
      .from("intake_forms")
      .select("*, intake_fields(*)")
      .eq("org_id", ctx.orgId)
      .order("sort", { ascending: true }),
    supabase.from("refund_policies").select("*").eq("org_id", ctx.orgId),
    supabase.auth.getUser(),
    supabase.from("card_payment_links").select("id, title, url").eq("org_id", ctx.orgId).order("created_at", { ascending: false }),
  ]);

  return (
    <MenuSettings
      orgId={ctx.orgId}
      referrerUserId={ctx.userId}
      initialCompany={{
        name: org?.name ?? "",
        display_name: org?.display_name ?? "",
        rep_name: org?.rep_name ?? "",
        address: org?.address ?? "",
        tel: org?.tel ?? "",
        email: org?.email ?? "",
      }}
      initialMenus={(menus ?? []).map((m) => ({ ...m, menu_questions: (m.menu_questions ?? []).sort((a, b) => a.sort - b.sort) }))}
      initialLoginEmail={userData.user?.email ?? ""}
      initialTemplates={(templates ?? []).map((t) => ({ ...t, intake_fields: (t.intake_fields ?? []).sort((a, b) => a.sort - b.sort) }))}
      initialRefundPolicy={policy ?? []}
      initialSolo={ctx.solo}
      slug={org?.slug ?? null}
      initialCardPaymentEnabled={org?.card_payment_enabled ?? false}
      initialBankInfo={org?.bank_transfer_info ?? {}}
      initialCardPaymentLinks={cardPaymentLinks ?? []}
    />
  );
}
