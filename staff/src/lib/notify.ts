import type { createServiceRoleClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createServiceRoleClient>;

// 依頼主向け・事業者向けの通知メール一式。RESEND_API_KEYが未設定の間は
// 送信をスキップする（クライアントアプリのnotify.tsと同じ、段階的導入の
// パターン）。失敗しても呼び出し側の本処理は止めない設計なので、ここでは
// エラーを投げず握りつぶす。
async function sendEmail(to: string | string[], subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("sendEmail: RESEND_API_KEY is not set — skipping email");
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL ?? "PORT <onboarding@resend.dev>";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch (e) {
    console.error("sendEmail failed", e);
  }
}

// 利用にはメール確認が必須になっているため基本的に全員メールを持つが、
// 念のため取れない場合は通知自体を黙ってスキップする。
async function getCustomerEmail(admin: Admin, customerId: string): Promise<string | null> {
  const { data: customer } = await admin.from("customers").select("profile_id").eq("id", customerId).maybeSingle();
  if (!customer?.profile_id) return null;
  const { data } = await admin.auth.admin.getUserById(customer.profile_id);
  return data.user?.email ?? null;
}


async function getOrgSlug(admin: Admin, orgId: string): Promise<{ displayName: string; slug: string | null }> {
  const { data } = await admin.from("organizations").select("display_name, slug").eq("id", orgId).maybeSingle();
  return { displayName: data?.display_name ?? "", slug: data?.slug ?? null };
}

function customerChatUrl(slug: string | null): string {
  return slug ? `https://port.s-stylegolf.com/${slug}` : "https://port.s-stylegolf.com";
}

export async function notifyCustomerQuoteCreated(admin: Admin, orgId: string, customerId: string, amount: number, title: string) {
  try {
    const email = await getCustomerEmail(admin, customerId);
    if (!email) return;
    const { displayName, slug } = await getOrgSlug(admin, orgId);
    await sendEmail(
      email,
      `【${displayName}】お見積りが届いています`,
      `<p>${displayName}より、お見積り（${title}・¥${amount.toLocaleString("ja-JP")}）が届いています。</p><p><a href="${customerChatUrl(slug)}">トーク画面を開いて確認する</a></p>`,
    );
  } catch (e) {
    console.error("notifyCustomerQuoteCreated failed", e);
  }
}

export async function notifyCustomerCompletionReport(admin: Admin, orgId: string, customerId: string) {
  try {
    const email = await getCustomerEmail(admin, customerId);
    if (!email) return;
    const { displayName, slug } = await getOrgSlug(admin, orgId);
    await sendEmail(
      email,
      `【${displayName}】完了報告が届いています`,
      `<p>${displayName}より、完了報告が届いています。</p><p><a href="${customerChatUrl(slug)}">トーク画面を開いて確認する</a></p>`,
    );
  } catch (e) {
    console.error("notifyCustomerCompletionReport failed", e);
  }
}


// 本部が依頼主トークに書き込む「直前」に呼ぶ。依頼主が最後にトーク画面で読んだ後、
// まだ本部からのメッセージが1通も届いていなければ true（＝これから送る1通が
// 未読の先頭なのでメールする）。未読のまま本部が続けて送った2通目以降は false に
// なり、依頼主が読むまでメールは1通だけにする（本部側の notifyNewInquiry と同じ考え方）。
export async function isCustomerCaughtUp(admin: Admin, threadId: string): Promise<boolean> {
  try {
    const { data: thread } = await admin.from("threads").select("kind, customer_last_read_at").eq("id", threadId).maybeSingle();
    if (thread?.kind !== "customer") return false;
    let q = admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .is("deleted_at", null)
      .not("sender_role", "is", null)
      .neq("sender_role", "client");
    if (thread.customer_last_read_at) q = q.gt("sent_at", thread.customer_last_read_at);
    const { count } = await q;
    return (count ?? 0) === 0;
  } catch (e) {
    console.error("isCustomerCaughtUp failed", e);
    return false;
  }
}

export async function notifyCustomerNewMessage(admin: Admin, threadId: string) {
  try {
    const { data: thread } = await admin.from("threads").select("org_id, customer_id").eq("id", threadId).maybeSingle();
    if (!thread?.customer_id) return;
    const email = await getCustomerEmail(admin, thread.customer_id);
    if (!email) return;
    const { displayName, slug } = await getOrgSlug(admin, thread.org_id);
    await sendEmail(
      email,
      `【${displayName}】新着メッセージがあります`,
      `<p>${displayName}から新しいメッセージが届いています。</p><p><a href="${customerChatUrl(slug)}">トーク画面を開いて確認する</a></p>`,
    );
  } catch (e) {
    console.error("notifyCustomerNewMessage failed", e);
  }
}

// 自動チャージの失敗・停止は、トーク内のお知らせだけだと依頼主が開くまで
// 気づけず、定期対応の引き落としに間に合わないためメールでも知らせる。
export async function notifyCustomerAutoRechargeFailed(admin: Admin, orgId: string, customerId: string, stopped: boolean) {
  try {
    const email = await getCustomerEmail(admin, customerId);
    if (!email) return;
    const { displayName, slug } = await getOrgSlug(admin, orgId);
    await sendEmail(
      email,
      stopped ? `【${displayName}】自動チャージを停止しました` : `【${displayName}】自動チャージに失敗しました`,
      `<p>${
        stopped
          ? "カードへの請求に続けて失敗したため、自動チャージを停止しました。マイページから設定し直してください。"
          : "自動チャージに失敗しました。カード情報をご確認のうえ、必要であればマイページから設定し直してください。"
      }</p><p><a href="${customerChatUrl(slug)}">トーク画面を開く</a></p>`,
    );
  } catch (e) {
    console.error("notifyCustomerAutoRechargeFailed failed", e);
  }
}
