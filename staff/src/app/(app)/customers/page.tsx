import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { headingWeight } from "@/lib/style";
import { previewMessage } from "@/lib/message-preview";
import CustomersList from "@/components/CustomersList";

export default async function CustomersPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null; // layout already handles the access-denied state

  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select(
      "id, name, member_no, active, creator_id, creators(profiles(display_name)), converted_org_id, converted_org:organizations!customers_converted_org_id_fkey(display_name, slug), threads(id, kind, archived_at, last_msg_at, last_read_at, messages(kind, body, payload, deleted_at, sent_at, sender_role))",
    )
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .order("sent_at", { referencedTable: "threads.messages", ascending: false })
    .limit(1, { referencedTable: "threads.messages" });

  const rows = (customers ?? [])
    .map((c) => {
      const creator = Array.isArray(c.creators) ? c.creators[0] : c.creators;
      const profile = creator && !Array.isArray(creator.profiles) ? creator.profiles : Array.isArray(creator?.profiles) ? creator.profiles[0] : null;
      const convertedOrg = Array.isArray(c.converted_org) ? c.converted_org[0] : c.converted_org;
      const thread = (c.threads ?? []).find((t) => t.kind === "customer") ?? null;
      const lastMessage = thread?.messages?.[0] ?? null;
      const unread =
        !!thread &&
        !thread.archived_at &&
        lastMessage?.sender_role === "client" &&
        (!thread.last_read_at || (thread.last_msg_at != null && thread.last_msg_at > thread.last_read_at));
      return {
        id: c.id,
        name: c.name,
        memberNo: c.member_no,
        active: c.active,
        creatorName: profile?.display_name ?? null,
        convertedOrg: convertedOrg ? { displayName: convertedOrg.display_name, slug: convertedOrg.slug } : null,
        thread: thread ? { id: thread.id, archived: !!thread.archived_at } : null,
        lastMessagePreview: lastMessage ? previewMessage(lastMessage) : null,
        unread,
      };
    })
    // やり取りが一度もない依頼主（ページを開いただけ）は一覧に一切出さない
    .filter((r) => r.lastMessagePreview !== null);

  return (
    <div style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%", margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>依頼主</div>

      {error && <div style={{ fontSize: 13, color: "var(--color-accent-200)" }}>読み込みに失敗しました。</div>}

      {!error && rows.length === 0 && (
        <div style={{ fontSize: 13.5, color: "var(--color-neutral-500)", lineHeight: 1.7 }}>
          まだ依頼主がいません。依頼主用のチャット画面にアクセスがあると、ここに一覧が表示されます。
        </div>
      )}

      <CustomersList rows={rows} isHq={ctx.isHq} orgId={ctx.orgId} />
    </div>
  );
}
