import { createServiceRoleClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createServiceRoleClient>;

async function sendStaffEmail(admin: Admin, emails: string[], subject: string, html: string) {
  if (!emails.length) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = process.env.RESEND_FROM_EMAIL ?? "PORT <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: emails, subject, html }),
  });
}

async function emailsFor(admin: Admin, profileIds: string[]): Promise<string[]> {
  const emails: string[] = [];
  for (const id of profileIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emails.push(data.user.email);
  }
  return emails;
}

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

    const emails = await emailsFor(admin, staff.map((s) => s.id));
    const staffUrl = process.env.NEXT_PUBLIC_STAFF_APP_URL ?? "";
    await sendStaffEmail(
      admin,
      emails,
      `【PORT】新規のお問い合わせがあります（${org?.display_name ?? ""}）`,
      `<p>${org?.display_name ?? ""}に新しいお問い合わせが届きました。</p>${staffUrl ? `<p><a href="${staffUrl}">受付画面を開いて確認する</a></p>` : ""}`,
    );
  } catch (e) {
    console.error("notifyNewInquiryIfFirst failed", e);
  }
}

// 依頼主が残高払いで「依頼を確定する」を押した瞬間に、担当窓口のオーナー・
// マネージャーへ即時メールで知らせる（支払い済みなのに着手されず放置される
// のを防ぐため）。失敗しても支払い自体は止めない。
export async function notifyStaffPaymentConfirmed(orgId: string, requestId: string) {
  try {
    const admin = createServiceRoleClient();

    const [{ data: request }, { data: org }] = await Promise.all([
      admin.from("requests").select("title, amount, customer_id").eq("id", requestId).maybeSingle(),
      admin.from("organizations").select("display_name").eq("id", orgId).single(),
    ]);
    if (!request) return;

    // 依頼主の窓口は、その依頼主の「customerトーク」が持つ department_id で
    // 決まる（customersテーブル自体には窓口の列がない）。
    const { data: customerThread } = await admin
      .from("threads")
      .select("department_id")
      .eq("customer_id", request.customer_id)
      .eq("kind", "customer")
      .maybeSingle();
    const departmentId = customerThread?.department_id ?? null;

    const [{ data: owners }, { data: deptStaff }] = await Promise.all([
      admin.from("profiles").select("id").eq("org_id", orgId).eq("role", "owner"),
      departmentId ? admin.from("staff_departments").select("profile_id").eq("department_id", departmentId) : Promise.resolve({ data: [] as { profile_id: string }[] }),
    ]);
    const deptStaffIds = (deptStaff ?? []).map((d) => d.profile_id);
    const { data: managers } = deptStaffIds.length
      ? await admin.from("profiles").select("id").in("id", deptStaffIds).eq("role", "dept_manager")
      : { data: [] as { id: string }[] };

    const profileIds = [...new Set([...(owners ?? []).map((o) => o.id), ...(managers ?? []).map((m) => m.id)])];
    if (!profileIds.length) return;

    const emails = await emailsFor(admin, profileIds);
    const staffUrl = process.env.NEXT_PUBLIC_STAFF_APP_URL ?? "";
    const caseUrl = staffUrl ? `${staffUrl}/cases/${requestId}` : "";
    await sendStaffEmail(
      admin,
      emails,
      `【PORT】依頼が確定しました（${request.title}・¥${request.amount.toLocaleString("ja-JP")}）`,
      `<p>${org?.display_name ?? ""}で、依頼主が依頼を確定し、お支払いが完了しました。</p><p>${request.title}・¥${request.amount.toLocaleString("ja-JP")}</p>${
        caseUrl ? `<p><a href="${caseUrl}">案件トークを開いて確認する</a></p>` : ""
      }`,
    );
  } catch (e) {
    console.error("notifyStaffPaymentConfirmed failed", e);
  }
}
