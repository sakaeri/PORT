import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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
      .select("id, org_id, name, member_no")
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
        .select("id, org_id, name, member_no")
        .eq("id", newCustomerId)
        .maybeSingle()
    ).data;
  }
  if (!customer) {
    console.error("getCustomerContext: customer row still missing after ensure_customer_for_org", { orgId, userId: auth.user.id });
    return null;
  }

  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("kind", "customer")
    .maybeSingle();
  if (!thread) {
    console.error("getCustomerContext: no customer thread found", { customerId: customer.id });
    return null;
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("display_name, is_hq, plan_status, trial_ends_on")
    .eq("id", customer.org_id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", auth.user.id)
    .maybeSingle();

  const trialExpired = org?.trial_ends_on != null && org.trial_ends_on < new Date().toISOString().slice(0, 10);
  const orgLocked =
    !!org &&
    !org.is_hq &&
    (org.plan_status === "past_due" || org.plan_status === "paused" || org.plan_status === "cancelled" || (org.plan_status === "trial" && trialExpired));

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
    orgLocked,
  };
});

// 画面に必要な最新分だけ取得する（会話が長くなっても初回表示は遅くならない）。
export async function getThreadMessages(threadId: string): Promise<{ messages: MessageWithExtras[]; hasMoreOlder: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(
      "*, message_attachments(*), requests(*, request_items(*), completion_reports(*), ratings(*))",
    )
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (error || !data) return { messages: [], hasMoreOlder: false };
  const rows = (data as RawMessageRow[]).slice().reverse();
  return { messages: rows.map(mapMessageRow), hasMoreOlder: data.length === MESSAGE_PAGE_SIZE };
}

// 依頼主には価格を一切見せない（見積りで初めて金額が決まる）。price/payout/
// department_id は受付側の内部情報なので、依頼主のブラウザには送らない。
export async function getMenus(orgId: string) {
  const supabase = await createClient();
  const { data: menus } = await supabase
    .from("menus")
    .select("id, label, icon, note, menu_questions(id, label)")
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

// マイページの「この窓口のしくみを、自社でも」ボタン用。押した瞬間に受付
// アプリの /signup へ直接飛べるよう、事業所のオーナーの profile id を
// あらかじめページ読み込み時に解決しておく（クリック時に非同期処理を
// 挟まない）。依頼主のセッションには profiles を読む権限が無いため
// service role を使う。.limit(1) は、万一同じ org に owner ロールの
// profiles 行が複数あっても maybeSingle() がエラーにならないようにするため。
export async function getReferralSignupUrl(orgId: string): Promise<string> {
  const admin = createServiceRoleClient();
  const { data: owner } = await admin.from("profiles").select("id").eq("org_id", orgId).eq("role", "owner").limit(1).maybeSingle();
  const staffAppUrl = process.env.NEXT_PUBLIC_STAFF_APP_URL ?? "";
  return owner ? `${staffAppUrl}/signup?ref=${owner.id}` : `${staffAppUrl}/signup`;
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
