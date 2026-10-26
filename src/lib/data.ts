import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { MESSAGE_PAGE_SIZE, mapMessageRow, type CustomerContext, type MessageWithExtras, type RawMessageRow, type RequestBundle } from "@/lib/chat-types";

export type { CustomerContext, MessageWithExtras, RequestBundle };

// page.tsx calls this before getCustomerContext() to tell apart "not signed
// in yet" (expected on a brand-new visit now that proxy.ts no longer signs
// visitors in automatically — see VerifyGate) from a genuine failure further
// down (env vars missing, DB trigger not run), which still needs its own
// error message rather than silently reshowing the verify gate forever.
export async function hasAuthSession(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return !!data.user;
}

export function deskTitle(name: string) {
  return `${name} お問い合わせ窓口`;
}

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
  if (!orgId) {
    console.error("getCustomerContext: x-vid-org header missing (proxy.ts failed to resolve an org for this domain)");
    return null;
  }

  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (!auth.user) {
    console.error("getCustomerContext: no authenticated user", authErr);
    return null;
  }

  let customer = (
    await supabase
      .from("customers")
      .select("id, org_id, name, member_no, balance, stripe_payment_method_id, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount")
      .eq("profile_id", auth.user.id)
      .eq("org_id", orgId)
      .maybeSingle()
  ).data;

  if (!customer) {
    const { data: newCustomerId, error } = await supabase.rpc("ensure_customer_for_org", { p_org_id: orgId });
    if (error || !newCustomerId) {
      console.error("getCustomerContext: ensure_customer_for_org failed", { orgId, error });
      return null;
    }
    customer = (
      await supabase
        .from("customers")
        .select("id, org_id, name, member_no, balance, stripe_payment_method_id, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount")
        .eq("id", newCustomerId)
        .maybeSingle()
    ).data;
  }
  if (!customer) {
    console.error("getCustomerContext: customer row still missing after ensure_customer_for_org", { orgId, userId: auth.user.id });
    return null;
  }

  // 問い合わせ窓口のURL（/teera など）から入ったとき。まだ何も書いていないトークなら
  // 窓口の印を付けて、その窓口の担当秘書に割り当てる（claim_desk_thread）。
  let closedDeskName: string | null = null;
  const deskSlug = h.get("x-vid-desk-slug");
  if (deskSlug) {
    const row = (await supabase.rpc("desk_by_slug", { p_slug: deskSlug })).data?.[0];
    if (row && row.org_id === customer.org_id) {
      if (row.active) {
        const { error } = await supabase.rpc("claim_desk_thread", { p_desk_id: row.id });
        if (error) console.error("getCustomerContext: claim_desk_thread failed", error);
      } else {
        closedDeskName = row.name;
      }
    }
  }

  const { data: thread } = await supabase
    .from("threads")
    .select("id, desk_id")
    .eq("customer_id", customer.id)
    .eq("kind", "customer")
    .maybeSingle();
  if (!thread) {
    console.error("getCustomerContext: no customer thread found", { customerId: customer.id });
    return null;
  }

  // 依頼主の画面（チャットだけになるか）は、URLではなくトークが窓口のものかで決まる。
  let desk: CustomerContext["desk"] = null;
  if (thread.desk_id) {
    const row = (await supabase.rpc("desk_by_id", { p_id: thread.desk_id })).data?.[0];
    if (row) desk = { id: row.id, name: row.name, active: row.active };
  }
  // 受付を止めた窓口のURLから、まだその窓口のトークを持っていない人が来たとき。
  if (desk) closedDeskName = null;

  const { data: org } = await supabase
    .from("organizations")
    .select("display_name")
    .eq("id", customer.org_id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url, role")
    .eq("id", auth.user.id)
    .maybeSingle();

  return {
    userId: auth.user.id,
    orgId: customer.org_id,
    orgDisplayName: desk ? deskTitle(desk.name) : (org?.display_name ?? "窓口"),
    customerId: customer.id,
    customerName: customer.name,
    memberNo: customer.member_no,
    threadId: thread.id,
    email: auth.user.email ?? null,
    isAnonymous: auth.user.is_anonymous ?? false,
    hasPassword: auth.user.user_metadata?.has_password === true,
    // 本部・スタッフのアカウントでも依頼主画面に入れる（同じログイン）。その場合の
    // パスワードとメールアドレスは本部画面のログインと共用なので、ここでは変えさせない。
    isStaffAccount: !!profile && profile.role !== "client",
    avatarUrl: profile?.avatar_url ?? null,
    balance: customer.balance,
    autoRecharge: {
      enabled: customer.auto_recharge_enabled,
      threshold: customer.auto_recharge_threshold,
      amount: customer.auto_recharge_amount,
      hasCard: !!customer.stripe_payment_method_id,
    },
    desk,
    closedDeskName,
  };
});

// 画面に必要な最新分だけ取得する（会話が長くなっても初回表示は遅くならない）。
export async function getThreadMessages(threadId: string): Promise<{ messages: MessageWithExtras[]; hasMoreOlder: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(
      "*, message_attachments(*), profiles!messages_sender_id_fkey(display_name, avatar_url), requests(*, request_items(*), completion_reports(*), completion_report_attachments(*), ratings(*))",
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (error || !data) {
    console.error("getThreadMessages failed", { threadId, error });
    return { messages: [], hasMoreOlder: false };
  }
  const rows = (data as RawMessageRow[]).slice().reverse();
  return { messages: rows.map(mapMessageRow), hasMoreOlder: data.length === MESSAGE_PAGE_SIZE };
}

