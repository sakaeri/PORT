"use server";

import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCustomerContext, getRefundPolicies } from "@/lib/data";
import { computeRefund } from "@/lib/refund";
import { notifyNewInquiryIfFirst } from "@/lib/notify";

async function requireContext() {
  const ctx = await getCustomerContext();
  if (!ctx) throw new Error("認証されていません");
  return ctx;
}

// proxy.ts はもう匿名ログインを自動では行わない（VerifyGate参照）。初回訪問時、
// 見えない認証（Cloudflare Turnstile）を通ってからこれを呼び、そこで初めて
// 匿名セッションを開始する。TURNSTILE_SECRET_KEY が未設定の間は検証をスキップ
// する（本番公開前に必ず設定すること。未設定のまま公開すると誰でも無制限に
// 匿名アカウントを作成できてしまう）。
export async function completeAnonymousEntry(turnstileToken: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("completeAnonymousEntry: TURNSTILE_SECRET_KEY is not set — skipping CAPTCHA verification");
  } else {
    if (!turnstileToken) throw new Error("認証に失敗しました。ページを再読み込みしてもう一度お試しください。");
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: turnstileToken }),
    });
    const data = (await res.json()) as { success: boolean };
    if (!data.success) throw new Error("認証に失敗しました。ページを再読み込みしてもう一度お試しください。");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

// 新規の問い合わせ・返信など、事業所にとって新しいやり取りを生む操作専用。
// トライアル終了・支払い滞納などでロック中の窓口では使えない
// （過去のやり取りの閲覧や、キャンセル・評価などの既存のやり取りの後始末は
// requireContext() のままブロックしない）。
async function requireActiveContext() {
  const ctx = await requireContext();
  if (ctx.orgLocked) throw new Error("現在この窓口は新しいお問い合わせを受け付けておりません。しばらくしてから再度お試しください。");
  return ctx;
}

// メッセージを送るたびに呼ぶ。これを忘れると threads.last_msg_at が
// 依頼主側の新着で更新されず、受付側の未読判定が効かなくなる。
// threads の RLS は受付（is_office()）にしか update を許可していないため、
// 依頼主自身のセッションではこの更新が黙って0件のまま失敗する — service role
// で書く（last_msg_at を進めるだけの安全な操作なので、ここだけRLSを迂回する）。
async function touchThread(threadId: string) {
  const admin = createServiceRoleClient();
  await admin.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
}

// 既存アカウントへのログイン（マジックリンク）。今の匿名セッションのトーク内容は
// 引き継がれない — 呼び出し側（UI）で事前に確認を取ってから呼ぶこと。
export async function requestMagicLink(email: string) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("メールアドレスをご入力ください");
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    // 既存アカウントへのログイン専用。true にすると初見のメールアドレスでも
    // 新規ユーザーが作られてしまい、customers 行を持たない空アカウントに
    // なってしまう（新規登録は決済画面の別フローで行う）。
    options: { emailRedirectTo: `${protocol}://${host}/auth/confirm`, shouldCreateUser: false },
  });
  if (error) throw new Error("このメールアドレスのご登録が見つかりませんでした。初めてのご利用の場合は、決済の画面から新規登録してください。");
}

export async function sendMessage(text: string, attachments: { path: string; name: string; mime: string; bytes: number }[]) {
  const ctx = await requireActiveContext();
  const supabase = await createClient();
  const trimmed = text.trim();
  if (!trimmed && attachments.length === 0) return;

  if (attachments.length > 0) {
    const { data: filesMsg, error } = await supabase
      .from("messages")
      .insert({ thread_id: ctx.threadId, sender_id: ctx.userId, sender_role: "client", kind: "files" })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.from("message_attachments").insert(
      attachments.map((a) => ({ message_id: filesMsg.id, file_path: a.path, file_name: a.name, mime: a.mime, bytes: a.bytes })),
    );
  }
  if (trimmed) {
    const { error } = await supabase
      .from("messages")
      .insert({ thread_id: ctx.threadId, sender_id: ctx.userId, sender_role: "client", kind: "text", body: trimmed });
    if (error) throw error;
  }
  await touchThread(ctx.threadId);
  await notifyNewInquiryIfFirst(ctx.orgId, ctx.threadId);
}

export async function submitMenuInquiry(
  menuId: string,
  menuLabel: string,
  menuIcon: string | null,
  rows: { label: string; value: string }[],
  note: string,
) {
  const ctx = await requireActiveContext();
  const supabase = await createClient();
  const filled = rows.filter((r) => r.value.trim());
  const { error } = await supabase.from("messages").insert({
    thread_id: ctx.threadId,
    sender_id: ctx.userId,
    sender_role: "client",
    kind: "menu_pick",
    payload: { menuId, menuLabel, menuIcon, rows: filled, note: note.trim() },
  });
  if (error) throw error;
  await touchThread(ctx.threadId);
  await notifyNewInquiryIfFirst(ctx.orgId, ctx.threadId);
  await assignThreadDepartmentFromMenu(ctx.threadId, menuId);
}

// 依頼主が最初にメニューを選んだ時点で、そのトーク全体を該当の窓口に
// 紐付ける（一度紐付いたら、以後は受付が手動で切り替えるまで変わらない）。
// これは受付側の窓口権限を絞るためのRLSにも使うため、依頼主自身の書き込み
// 権限では更新できないようservice roleで行う。
async function assignThreadDepartmentFromMenu(threadId: string, menuId: string) {
  const admin = createServiceRoleClient();
  const { data: menu } = await admin.from("menus").select("department_id").eq("id", menuId).maybeSingle();
  if (!menu?.department_id) return;
  await admin.from("threads").update({ department_id: menu.department_id }).eq("id", threadId).is("department_id", null);
}

// id が null（または DB にまだ存在しない一時ID）なら新規作成として扱い、
// 実際の行IDを返す。呼び出し側はローカルの仮IDをこれで置き換える。
export async function saveVaultItem(id: string | null, label: string, value: string): Promise<string> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const isNew = !id || id.startsWith("temp-");
  if (!isNew) {
    await supabase.from("customer_vault_items").update({ label, value, updated_at: new Date().toISOString() }).eq("id", id);
    return id as string;
  }
  const { data, error } = await supabase
    .from("customer_vault_items")
    .insert({ customer_id: ctx.customerId, label, value })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("保存できませんでした");
  return data.id;
}

export async function deleteVaultItem(id: string) {
  if (id.startsWith("temp-")) return; // まだDBに存在しない行はローカルで消すだけでよい
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("customer_vault_items").delete().eq("id", id);
  if (error) throw error;
}

// 見積もりの「はじめの質問」（menu_pick）と同じく、その場のメッセージとしてのみ残す。
// 依頼主ごとの永続データ（customer_vault_items＝マイページの「よく使う情報」）には繋げない
// —— 確認事項テンプレはあくまで一回きりのやり取りとして扱う。
export async function submitInfoRequestAnswer(formLabel: string, fields: { label: string; value: string }[]) {
  const ctx = await requireActiveContext();
  const filled = fields.filter((f) => f.value.trim());
  if (!filled.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    thread_id: ctx.threadId,
    sender_id: ctx.userId,
    sender_role: "client",
    kind: "intake_answer",
    payload: { formLabel, rows: filled },
  });
  if (error) throw error;
  await touchThread(ctx.threadId);
  await notifyNewInquiryIfFirst(ctx.orgId, ctx.threadId);
}

// 受付への依頼として本人発言のまま投稿する（自動応答は作らない — 実際の返信は
// 受付が対応してから届く。プロトタイプの「即座に受付が返信する」演出は本番では行わない）。
export async function requestNameChange(newName: string, reason: string) {
  const ctx = await requireActiveContext();
  const supabase = await createClient();
  const trimmed = newName.trim();
  if (!trimmed || !reason) throw new Error("入力内容をご確認ください");

  const { error } = await supabase.from("messages").insert({
    thread_id: ctx.threadId,
    sender_id: ctx.userId,
    sender_role: "client",
    kind: "text",
    body: `お名前の変更をお願いします。新しいお名前：${trimmed}／理由：${reason}`,
  });
  if (error) throw error;
  await touchThread(ctx.threadId);
}

// 決済前の初回登録のみ。以降の変更は requestNameChange（受付経由）に切り替わる
// （RLS の customers_self_set_name_once が2回目以降の自己更新を拒否する）。
export async function setInitialProfile(name: string, email: string, phone: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName || !trimmedEmail) throw new Error("お名前とメールアドレスをご入力ください");

  // 既に一度セルフ登録済みなら customers_self_set_name_once に弾かれて0件のまま
  // 成功扱いになる。RLS ブロックとみなさず、既存の名前のまま先に進む（決済を止めない）。
  await supabase.from("customers").update({ name: trimmedName }).eq("id", ctx.customerId).select("id");

  const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail });
  if (emailErr) {
    if (emailErr.code === "email_exists") {
      throw new Error("このメールアドレスは既に登録されています。すでにご利用の方は「ログイン」をお試しください。");
    }
    throw emailErr;
  }

  if (phone.trim()) {
    const { data: existing } = await supabase
      .from("customer_vault_items")
      .select("id")
      .eq("customer_id", ctx.customerId)
      .eq("label", "電話番号")
      .maybeSingle();
    if (existing) await supabase.from("customer_vault_items").update({ value: phone.trim() }).eq("id", existing.id);
    else await supabase.from("customer_vault_items").insert({ customer_id: ctx.customerId, label: "電話番号", value: phone.trim() });
  }
}

// マイページから名前だけ先に決めたい場合用（決済フローとは独立）。
// customers_self_set_name_once ポリシーにより、プレースホルダーからの1回だけ通る。
export async function setInitialName(name: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("お名前をご入力ください");
  // RLS が拒否すると対象行が0件のまま成功扱いになるため、更新後の行の有無で判定する。
  const { data, error } = await supabase.from("customers").update({ name: trimmed }).eq("id", ctx.customerId).select("id");
  if (error || !data?.length) throw new Error("お名前は既に登録済みです。変更は「変更を依頼」からお願いします。");
}

export async function updateAvatar(url: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", ctx.userId);
  if (error) throw error;
}

export async function removeAvatar() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", ctx.userId);
  if (error) throw error;
}

export async function changeEmail(newEmail: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) throw error;
}

export async function submitRating(requestId: string, stars: number, comment: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .insert({ request_id: requestId, customer_id: ctx.customerId, stars, comment: comment.trim() || null, skipped: false });
  if (error) throw error;
}

export async function skipRating(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .insert({ request_id: requestId, customer_id: ctx.customerId, stars: null, skipped: true });
  if (error) throw error;
}

export async function cancelRequest(requestId: string) {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();

  const { data: r, error } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .eq("customer_id", ctx.customerId)
    .single();
  if (error || !r) throw new Error("依頼が見つかりません");
  if (r.phase === "completed" || r.phase === "cancelled" || r.phase === "declined") {
    throw new Error("この依頼はすでに終了しています");
  }

  const policies = await getRefundPolicies(ctx.orgId);
  const refund = computeRefund(r, policies);
  const now = new Date().toISOString();
  const nextPhase = r.phase === "quoted" ? "declined" : "cancelled";

  await admin
    .from("requests")
    .update({ phase: nextPhase, cancelled_at: now, refund_pct: refund.pct, refunded_amount: refund.amount })
    .eq("id", requestId);

  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    await admin.from("messages").insert({
      thread_id: caseThread.id,
      sender_id: null,
      sender_role: null,
      kind: "notice",
      body: nextPhase === "declined" ? "依頼主が見積もりをキャンセルしました" : `依頼主が依頼をキャンセルしました（返金 ${refund.amount.toLocaleString("ja-JP")}円）`,
    });
    await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
  }
}

// マイページの「この窓口のしくみを、自社でも」→「90日間無料で始める」用。
// 実際のセルフサインアップへのリンクはページ読み込み時に用意済み
// （getReferralSignupUrl）なので、ここでは営業フォロー用の記録だけ行う。
export async function startReferral() {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("referral_leads").insert({
    org_id: ctx.orgId,
    customer_id: ctx.customerId,
    customer_name: ctx.customerName,
    customer_email: ctx.email,
  });
  if (error) throw error;
}
