import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { mapMessageRow, type CustomerContext, type MessageWithExtras, type RawMessageRow, type RequestBundle } from "@/lib/chat-types";

export type { CustomerContext, MessageWithExtras, RequestBundle };

// Assumes proxy.ts has already ensured an authenticated (possibly anonymous)
// session and resolved x-vid-org from the domain. The DB trigger provisions
// the profile row; the customers/threads row for THIS org is provisioned here
// on first visit, since one login can now be a customer of several orgs
// (see 20260910000003_multi_org_customers.sql).
// Wrapped in React's cache() so generateMetadata and the page component share
// one lookup per request instead of hitting Supabase twice.
export const getCustomerContext = cache(async (): Promise<CustomerContext | null> => {
  const h = await headers();
  const orgId = h.get("x-vid-org");
  if (!orgId) return null; // proxy.ts failed to resolve an org for this domain

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  let customer = (
    await supabase
      .from("customers")
      .select("id, org_id, name, member_no")
      .eq("profile_id", auth.user.id)
      .eq("org_id", orgId)
      .maybeSingle()
  ).data;

  if (!customer) {
    const { data: newCustomerId, error } = await supabase.rpc("ensure_customer_for_org", { p_org_id: orgId });
    if (error || !newCustomerId) return null;
    customer = (
      await supabase
        .from("customers")
        .select("id, org_id, name, member_no")
        .eq("id", newCustomerId)
        .maybeSingle()
    ).data;
  }
  if (!customer) return null;

  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("kind", "customer")
    .maybeSingle();
  if (!thread) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("display_name")
    .eq("id", customer.org_id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", auth.user.id)
    .maybeSingle();

  return {
    userId: auth.user.id,
    orgId: customer.org_id,
    orgDisplayName: org?.display_name ?? "窓口",
    customerId: customer.id,
    customerName: customer.name,
    memberNo: customer.member_no,
    threadId: thread.id,
    email: auth.user.email ?? null,
    isAnonymous: auth.user.is_anonymous ?? false,
    avatarUrl: profile?.avatar_url ?? null,
  };
});

export async function getThreadMessages(threadId: string): Promise<MessageWithExtras[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(
      "*, message_attachments(*), requests(*, request_items(*), completion_reports(*), ratings(*))",
    )
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true });
  if (error || !data) return [];
  return (data as RawMessageRow[]).map(mapMessageRow);
}

export async function getMenus(orgId: string) {
  const supabase = await createClient();
  const { data: menus } = await supabase
    .from("menus")
    .select("*, menu_questions(*)")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("sort", { ascending: true });
  return menus ?? [];
}

export async function getRefundPolicies(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("refund_policies").select("*").eq("org_id", orgId);
  return data ?? [];
}

export async function getMyCompanies() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_companies");
  return data ?? [];
}

export async function getVaultItems(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_vault_items")
    .select("*")
    .eq("customer_id", customerId)
    .order("sort", { ascending: true });
  return data ?? [];
}
