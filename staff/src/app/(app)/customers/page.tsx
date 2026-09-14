import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import CustomersList from "@/components/CustomersList";

export default async function CustomersPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null; // layout already handles the access-denied state

  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select(
      "id, name, member_no, active, creator_id, creators(profiles(display_name)), converted_org_id, converted_org:organizations!customers_converted_org_id_fkey(display_name, slug), threads(id, kind, archived_at)",
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  const rows = (customers ?? []).map((c) => {
    const creator = Array.isArray(c.creators) ? c.creators[0] : c.creators;
    const profile = creator && !Array.isArray(creator.profiles) ? creator.profiles : Array.isArray(creator?.profiles) ? creator.profiles[0] : null;
    const convertedOrg = Array.isArray(c.converted_org) ? c.converted_org[0] : c.converted_org;
    const thread = (c.threads ?? []).find((t) => t.kind === "customer") ?? null;
    return {
      id: c.id,
      name: c.name,
      memberNo: c.member_no,
      active: c.active,
      creatorName: profile?.display_name ?? null,
      convertedOrg: convertedOrg ? { displayName: convertedOrg.display_name, slug: convertedOrg.slug } : null,
      thread: thread ? { id: thread.id, archived: !!thread.archived_at } : null,
    };
  });

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>依頼主</div>

      {error && <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>}

      {!error && rows.length === 0 && (
        <div style={{ fontSize: 13.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
          まだ依頼主がいません。依頼主用のチャット画面にアクセスがあると、ここに一覧が表示されます。
        </div>
      )}

      <CustomersList rows={rows} isHq={ctx.isHq} />
    </div>
  );
}
