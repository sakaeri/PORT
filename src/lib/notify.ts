import { createServiceRoleClient } from "@/lib/supabase/server";

// 依頼主からの最初のメッセージ（＝新規問い合わせ）が届いたときだけ、その事業所の
// 受付（owner/reception）全員のログイン用メールアドレスに通知する。2通目以降は
// 送らない（ログインして見ている前提のため）。失敗しても依頼主の送信自体は
// 止めない（呼び出し側で await せず、エラーはここで握りつぶす）。
export async function notifyNewInquiryIfFirst(orgId: string, threadId: string) {
  try {
    const admin = createServiceRoleClient();

    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", threadId)
      .eq("sender_role", "client");
    if ((count ?? 0) !== 1) return;

    const [{ data: org }, { data: staff }] = await Promise.all([
      admin.from("organizations").select("display_name").eq("id", orgId).single(),
      admin.from("profiles").select("id").eq("org_id", orgId).in("role", ["owner", "reception"]),
    ]);
    if (!staff?.length) return;

    const emails: string[] = [];
    for (const s of staff) {
      const { data } = await admin.auth.admin.getUserById(s.id);
      if (data.user?.email) emails.push(data.user.email);
    }
    if (!emails.length) return;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const from = process.env.RESEND_FROM_EMAIL ?? "PORT <onboarding@resend.dev>";
    const staffUrl = process.env.NEXT_PUBLIC_STAFF_APP_URL ?? "";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: emails,
        subject: `【PORT】新規のお問い合わせがあります（${org?.display_name ?? ""}）`,
        html: `<p>${org?.display_name ?? ""}に新しいお問い合わせが届きました。</p>${
          staffUrl ? `<p><a href="${staffUrl}">受付画面を開いて確認する</a></p>` : ""
        }`,
      }),
    });
  } catch (e) {
    console.error("notifyNewInquiryIfFirst failed", e);
  }
}
