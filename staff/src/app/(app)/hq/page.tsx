import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { previewMessage, senderPrefix } from "@/lib/message-preview";
import HqMessagesChat from "@/components/HqMessagesChat";

// 依頼主から本部への直接のご意見・ご要望（担当マネージャーには見えない）。
// 本部メンバー（owner）専用。
export default async function HqMessagesPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  if (ctx.role !== "owner") return null;

  const supabase = await createClient();
  const [{ data: customers }, { data: summaries }] = await Promise.all([
    supabase.from("customers").select("id, name").eq("org_id", ctx.orgId),
    supabase.rpc("hq_thread_summaries", { p_org_id: ctx.orgId }),
  ]);

  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));
  const rows = (summaries ?? [])
    .map((s) => ({
      customerId: s.customer_id,
      customerName: customerNameById.get(s.customer_id) ?? "—",
      threadId: s.thread_id,
      unread: s.unread,
      lastMessagePreview:
        s.last_message_kind != null
          ? previewMessage(
              { kind: s.last_message_kind, body: s.last_message_body, payload: s.last_message_payload, deleted_at: s.last_message_deleted_at },
              senderPrefix(s.last_message_sender_role),
            )
          : null,
    }))
    .filter((r) => r.lastMessagePreview !== null);

  return <HqMessagesChat currentUserId={ctx.userId} orgId={ctx.orgId} rows={rows} />;
}
