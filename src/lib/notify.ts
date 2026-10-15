import { createServiceRoleClient } from "@/lib/supabase/server";
import { emailSubject, renderEmail } from "@/lib/email-layout";

type Admin = ReturnType<typeof createServiceRoleClient>;

const SUPPORT_EMAIL = "hello.stb.app@gmail.com";

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

// 依頼主からのメッセージが「本部が未読の状態で」届いたときだけ、その事業所の
// 受付（owner/reception）全員のログイン用メールアドレスに通知する。本当に
// 最初の問い合わせだけでなく、既存の依頼主からの返信でも、本部がまだその
// 続きを読んでいない間は知らせる。ただし未読のまま連続でメッセージが来た
// 場合に毎通メールしないよう、「未読の先頭の1通」だけに絞る判定は呼び出し側
// （actions.ts の touchThread）が行い、ここは渡された時だけ送る。失敗しても
// 依頼主の送信自体は止めない（呼び出し側で await せず、エラーはここで握りつぶす）。
export async function notifyNewInquiry(orgId: string, threadId: string) {
  try {
    const admin = createServiceRoleClient();

    const [{ data: org }, { data: staff }, { data: thread }] = await Promise.all([
      admin.from("organizations").select("display_name").eq("id", orgId).single(),
      admin.from("profiles").select("id").eq("org_id", orgId).in("role", ["owner", "reception"]),
      admin.from("threads").select("customer_id").eq("id", threadId).maybeSingle(),
    ]);
    if (!staff?.length) return;

    const emails = await emailsFor(admin, staff.map((s) => s.id));
    const staffUrl = process.env.NEXT_PUBLIC_STAFF_APP_URL ?? "";
    const openUrl = staffUrl && thread?.customer_id ? `${staffUrl}/customers/${thread.customer_id}` : staffUrl;
    await sendStaffEmail(
      admin,
      emails,
      emailSubject(org?.display_name ?? "", "新着メッセージがあります"),
      renderEmail({ orgName: org?.display_name ?? "", heading: "新着メッセージがあります", lines: ["依頼主から新しいメッセージが届きました。"], url: openUrl, buttonLabel: "トークを確認する" }),
    );
  } catch (e) {
    console.error("notifyNewInquiry failed", e);
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
      emailSubject(org?.display_name ?? "", "依頼が確定しました"),
      renderEmail({
        orgName: org?.display_name ?? "",
        heading: "依頼が確定しました",
        lines: ["依頼主が依頼を確定し、お支払いが完了しました。", `${request.title}・¥${request.amount.toLocaleString("ja-JP")}`],
        url: caseUrl,
        buttonLabel: "案件を確認する",
      }),
    );
  } catch (e) {
    console.error("notifyStaffPaymentConfirmed failed", e);
  }
}

// 依頼主のログイン用メールアドレスの変更が完了したとき（auth/confirm で
// email_change の確認が通り、実際にアドレスが切り替わった時点）に呼ぶ。
// 前のアドレスへ「変更されました」とお知らせし（もう使えないアドレスなら
// 届かないだけで害はない）、依頼主トークにも記録を残して本部が気づけるようにする。
export async function notifyEmailChanged(userId: string, prevEmail: string) {
  try {
    const admin = createServiceRoleClient();
    const { data: customers } = await admin.from("customers").select("id, org_id").eq("profile_id", userId);
    if (!customers?.length) return;

    const { data: threads } = await admin
      .from("threads")
      .select("id")
      .eq("kind", "customer")
      .in("customer_id", customers.map((c) => c.id));
    if (threads?.length) {
      await admin.from("messages").insert(threads.map((t) => ({ thread_id: t.id, sender_id: null, sender_role: null, kind: "notice" as const, body: "ログイン用のメールアドレスが変更されました" })));
    }

    const { data: org } = await admin.from("organizations").select("display_name, email").eq("id", customers[0].org_id).maybeSingle();
    const orgName = org?.display_name ?? "";
    // 連絡先はメールに統一する（事業所のメールが未登録なら PORT の問い合わせ窓口）。
    const contact = org?.email || SUPPORT_EMAIL;
    await sendStaffEmail(
      admin,
      [prevEmail],
      emailSubject(orgName, "メールアドレスが変更されました"),
      renderEmail({
        orgName,
        heading: "メールアドレスが変更されました",
        lines: [
          "ご登録のログイン用メールアドレスが変更されました。今後のご案内は新しいアドレスにお送りします。",
          `お心当たりがない場合は、お手数ですが ${contact} までメールでご連絡ください。`,
        ],
      }),
    );
  } catch (e) {
    console.error("notifyEmailChanged failed", e);
  }
}
