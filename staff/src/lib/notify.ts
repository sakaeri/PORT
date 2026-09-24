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

// 依頼主はほとんどが匿名ログインで、メールアドレスは「アカウント作成」を
// した人だけが持っている。それ以外は customers.profile_id はあっても
// auth.users.email が空なので、その場合は通知自体が黙ってスキップされる。
async function getCustomerEmail(admin: Admin, customerId: string): Promise<string | null> {
  const { data: customer } = await admin.from("customers").select("profile_id").eq("id", customerId).maybeSingle();
  if (!customer?.profile_id) return null;
  const { data } = await admin.auth.admin.getUserById(customer.profile_id);
  return data.user?.email ?? null;
}

async function getStaffEmails(admin: Admin, orgId: string): Promise<string[]> {
  const { data: staff } = await admin.from("profiles").select("id").eq("org_id", orgId).in("role", ["owner", "reception"]);
  if (!staff?.length) return [];
  const emails: string[] = [];
  for (const s of staff) {
    const { data } = await admin.auth.admin.getUserById(s.id);
    if (data.user?.email) emails.push(data.user.email);
  }
  return emails;
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

export async function notifyCustomerPaymentConfirmed(admin: Admin, orgId: string, customerId: string, label: string) {
  try {
    const email = await getCustomerEmail(admin, customerId);
    if (!email) return;
    const { displayName, slug } = await getOrgSlug(admin, orgId);
    await sendEmail(
      email,
      `【${displayName}】${label}を確認しました`,
      `<p>${displayName}にて、${label}を確認しました。</p><p><a href="${customerChatUrl(slug)}">トーク画面を開いて確認する</a></p>`,
    );
  } catch (e) {
    console.error("notifyCustomerPaymentConfirmed failed", e);
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

// 見積放置リマインドのcronから使う。1事業者につき複数件たまっていても
// メール1通にまとめる。
export async function notifyStaffQuoteStale(
  admin: Admin,
  orgId: string,
  requests: { title: string; amount: number; quotedAt: string }[],
) {
  try {
    const emails = await getStaffEmails(admin, orgId);
    if (!emails.length) return;
    const { displayName } = await getOrgSlug(admin, orgId);
    const rows = requests
      .map((r) => `<li>${r.title}（¥${r.amount.toLocaleString("ja-JP")}）— ${new Date(r.quotedAt).toLocaleDateString("ja-JP")}見積もり</li>`)
      .join("");
    const staffUrl = process.env.NEXT_PUBLIC_STAFF_APP_URL ?? "";
    await sendEmail(
      emails,
      `【PORT】入金確認待ちの見積もりがあります（${displayName}）`,
      `<p>依頼主からの入金確認がまだ押されていない見積もりが${requests.length}件あります。</p><ul>${rows}</ul>${
        staffUrl ? `<p><a href="${staffUrl}">受付画面を開いて確認する</a></p>` : ""
      }`,
    );
  } catch (e) {
    console.error("notifyStaffQuoteStale failed", e);
  }
}
