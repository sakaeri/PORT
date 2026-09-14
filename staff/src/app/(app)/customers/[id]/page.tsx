import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import CustomerThread, { type ThreadMessage } from "@/components/CustomerThread";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getStaffContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, member_no, converted_org_id, converted_org:organizations!customers_converted_org_id_fkey(display_name, slug)")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!customer) notFound();
  const convertedOrgRaw = Array.isArray(customer.converted_org) ? customer.converted_org[0] : customer.converted_org;
  const convertedOrg = convertedOrgRaw ? { displayName: convertedOrgRaw.display_name, slug: convertedOrgRaw.slug } : null;

  const { data: thread } = await supabase
    .from("threads")
    .select("id, archived_at")
    .eq("customer_id", id)
    .eq("kind", "customer")
    .maybeSingle();

  let initialMessages: ThreadMessage[] = [];
  if (thread) {
    const { data } = await supabase
      .from("messages")
      .select("*, message_attachments(*)")
      .eq("thread_id", thread.id)
      .order("sent_at", { ascending: true });
    initialMessages = (data ?? []).map((m) => ({ ...m, attachments: m.message_attachments ?? [] }));
  }

  return (
    <CustomerThread
      customer={{ id: customer.id, name: customer.name, memberNo: customer.member_no }}
      thread={thread ? { id: thread.id, archived: !!thread.archived_at } : null}
      initialMessages={initialMessages}
      role={ctx.role}
      isHq={ctx.isHq}
      convertedOrg={convertedOrg}
    />
  );
}
