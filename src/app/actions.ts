"use server";

import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCustomerContext, getRefundPolicies } from "@/lib/data";
import { computeRefund } from "@/lib/refund";
import { notifyNewInquiryIfFirst } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";

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

// チャージ残高からの支払い。二重消費を防ぐためのロック・検証はすべて
// pay_request_from_balance（DB側のsecurity definer関数）の中で行う。
export async function payFromBalance(requestId: string) {
  await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_request_from_balance", { p_request_id: requestId });
  if (error) throw error;

  const admin = createServiceRoleClient();
  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    const now = new Date().toISOString();
    await admin.from("messages").insert({ thread_id: caseThread.id, sender_id: null, sender_role: null, kind: "notice", body: "依頼を確定し、残高からお支払いいただきました" });
    await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
  }
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
  if (r.cancel_requested_at) throw new Error("すでにキャンセルを申請済みです");

  const now = new Date().toISOString();

  // 見積もり段階（まだ入金前）は費用が発生していないため、その場で断ってよい。
  if (r.phase === "quoted") {
    await admin.from("requests").update({ phase: "declined", cancelled_at: now }).eq("id", requestId);
    const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
    if (caseThread) {
      await admin.from("messages").insert({ thread_id: caseThread.id, sender_id: null, sender_role: null, kind: "notice", body: "依頼主が見積もりをキャンセルしました" });
      await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
    }
    return;
  }

  // すでに入金が発生している段階は、その場で返金額を確定させない。
  // 「キャンセル申請」として記録するだけにして、実際の返金額の確定と
  // 依頼主への案内は事業主が内容を確認してから行う（自動実行はしない）。
  const policies = await getRefundPolicies(ctx.orgId);
  const refund = computeRefund(r, policies);

  await admin.from("requests").update({ cancel_requested_at: now }).eq("id", requestId);

  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    await admin.from("messages").insert({
      thread_id: caseThread.id,
      sender_id: null,
      sender_role: null,
      kind: "notice",
      body: `依頼主がキャンセルを申請しました（規定上の目安：¥${refund.amount.toLocaleString("ja-JP")}・要確認）`,
    });
    await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
  }
}

// チャージ残高の入金。Stripeのホスト型Checkoutページへ飛ばし、支払い完了は
// Webhook（route.ts）側で検知して残高に反映する。ここでは決済ページのURLを
// 用意するだけで、残高はまだ一切動かさない（決済が実際に成立するまで反映
// しないことで、二重加算や未払いの加算を防ぐ）。
export async function startBalanceCharge(amountYen: number): Promise<string> {
  const ctx = await requireContext();
  if (!Number.isInteger(amountYen) || amountYen < 1000) throw new Error("チャージ額は1,000円以上で指定してください");

  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: amountYen,
          product_data: { name: "チャージ" },
        },
        quantity: 1,
      },
    ],
    metadata: { customer_id: ctx.customerId, org_id: ctx.orgId },
    success_url: `${origin}/?charge=success`,
    cancel_url: `${origin}/?charge=cancel`,
  });
  if (!session.url) throw new Error("決済ページを作成できませんでした");
  return session.url;
}

// 残高の自動チャージを設定する（有効化・変更は常にここを通る）。Stripeの
// Checkout（setupモード）でカードを確認・保存してもらい、実際の有効化・
// しきい値／金額の保存は Webhook 側（checkout.session.completed, mode=
// "setup"）で行う。既にstripe_customer_idがあればそれを使い回し、無ければ
// Stripe側に新しく作ってもらう。
export async function startAutoRechargeSetup(thresholdYen: number, amountYen: number): Promise<string> {
  const ctx = await requireContext();
  if (!Number.isInteger(thresholdYen) || thresholdYen < 1) throw new Error("しきい値を入力してください");
  if (!Number.isInteger(amountYen) || amountYen < 1000) throw new Error("チャージ額は1,000円以上で指定してください");

  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("stripe_customer_id").eq("id", ctx.customerId).maybeSingle();

  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    payment_method_types: ["card"],
    customer: customer?.stripe_customer_id ?? undefined,
    customer_creation: customer?.stripe_customer_id ? undefined : "always",
    metadata: {
      customer_id: ctx.customerId,
      org_id: ctx.orgId,
      auto_recharge_threshold: String(thresholdYen),
      auto_recharge_amount: String(amountYen),
    },
    success_url: `${origin}/?autorecharge=success`,
    cancel_url: `${origin}/?autorecharge=cancel`,
  });
  if (!session.url) throw new Error("設定ページを作成できませんでした");
  return session.url;
}

export async function disableAutoRecharge() {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_auto_recharge");
  if (error) throw error;
}

// 担当マネージャーには見えない、本部直通の「ご意見・ご要望」。普段の
// トークとは別のテーブル（hq_feedback）に入れるだけで、通常のスレッドには
// 一切残さない。
export async function sendHqFeedback(body: string) {
  const ctx = await requireContext();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("内容を入力してください");
  const supabase = await createClient();
  const { error } = await supabase.from("hq_feedback").insert({ org_id: ctx.orgId, customer_id: ctx.customerId, body: trimmed });
  if (error) throw error;
}

