import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";

export default async function CustomersPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null; // layout already handles the access-denied state

  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, member_no, creator_id, creators(profiles(display_name))")
    .eq("org_id", ctx.orgId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>依頼主</div>

      {error && <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>}

      {!error && (!customers || customers.length === 0) && (
        <div style={{ fontSize: 13.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
          まだ依頼主がいません。依頼主用のチャット画面にアクセスがあると、ここに一覧が表示されます。
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(customers ?? []).map((c) => {
          const creator = Array.isArray(c.creators) ? c.creators[0] : c.creators;
          const profile = creator && !Array.isArray(creator.profiles) ? creator.profiles : Array.isArray(creator?.profiles) ? creator.profiles[0] : null;
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-divider)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{c.member_no ?? "—"}</div>
              </div>
              <div style={{ flex: "none", fontSize: 11.5, color: "var(--color-neutral-500)" }}>
                {profile?.display_name ? `担当: ${profile.display_name}` : "未割り当て"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
