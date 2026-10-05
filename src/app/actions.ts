"use server";

import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCustomerContext } from "@/lib/data";
import { notifyNewInquiryIfFirst, notifyStaffPaymentConfirmed } from "@/lib/notify";
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

export async function sendMessage(text: string) {
  const ctx = await requireActiveContext();
  const supabase = await createClient();
  const trimmed = text.trim();
  if (!trimmed) return;

  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: ctx.threadId, sender_id: ctx.userId, sender_role: "client", kind: "text", body: trimmed });
  if (error) throw error;
  await touchThread(ctx.threadId);
  await notifyNewInquiryIfFirst(ctx.orgId, ctx.threadId);
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

// 依頼主本人の名前はいつでも自由に変更できる（customers_self_update ポリシー）。
// 社内向け（書類の宛名など）の呼び方は、本人のこの変更とは独立した
// customers.staff_label（本部・マネージャーが設定）を使う。
export async function updateCustomerName(name: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("お名前をご入力ください");
  const { error } = await supabase.from("customers").update({ name: trimmed }).eq("id", ctx.customerId);
  if (error) throw error;
}

export async function setInitialProfile(name: string, email: string, phone: string, agreedToTerms: boolean) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName || !trimmedEmail) throw new Error("お名前とメールアドレスをご入力ください");
  // クライアント側のチェックボックスだけに頼らず、サーバー側でも必ず確認する。
  if (!agreedToTerms) throw new Error("利用規約への同意が必要です");

  await supabase.from("customers").update({ name: trimmedName, terms_accepted_at: new Date().toISOString() }).eq("id", ctx.customerId);

  const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail });
  if (emailErr) {
    // Supabaseのバージョンによって "email_exists" と "user_already_exists" の
    // どちらで返ってくるかが変わるため、両方とも同じ案内文にする。
    if (emailErr.code === "email_exists" || emailErr.code === "user_already_exists") {
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
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      throw new Error("このメールアドレスは既に登録されています。");
    }
    throw error;
  }
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
  const ctx = await requireActiveContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_request_from_balance", { p_request_id: requestId });
  if (error) throw error;

  await notifyStaffPaymentConfirmed(ctx.orgId, requestId);

  const admin = createServiceRoleClient();
  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    const now = new Date().toISOString();
    await admin.from("messages").insert({ thread_id: caseThread.id, sender_id: null, sender_role: null, kind: "notice", body: "依頼を確定し、残高からお支払いいただきました" });
    await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
  }
}

// 頼んだ後のキャンセル・返金は一切行わない方針のため、キャンセルできるのは
// まだ決済前（見積もり段階）の見積もりを断る場合だけ。
export async function declineQuote(requestId: string) {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();

  const { data: r, error } = await admin
    .from("requests")
    .select("phase")
    .eq("id", requestId)
    .eq("customer_id", ctx.customerId)
    .single();
  if (error || !r) throw new Error("依頼が見つかりません");
  if (r.phase !== "quoted") throw new Error("この依頼はすでに決済が完了しているため、キャンセルできません");

  const now = new Date().toISOString();
  await admin.from("requests").update({ phase: "declined", cancelled_at: now }).eq("id", requestId);
  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    await admin.from("messages").insert({ thread_id: caseThread.id, sender_id: null, sender_role: null, kind: "notice", body: "依頼主が見積もりをキャンセルしました" });
    await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
  }
}

// 完了した単発の依頼について、依頼主から「次回も定期でお願いしたい」という
// 意思表示だけを秘書に伝える。金額はここでは一切確定しない（単発より安く
// 出す、といった金額の判断は常に秘書側に残すため）。秘書はこれを見て、
// 改めて定期の見積もりを作って送り返す。
export async function requestRecurringFollowup(requestId: string) {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();

  const { data: r, error } = await admin.from("requests").select("phase, cadence").eq("id", requestId).eq("customer_id", ctx.customerId).single();
  if (error || !r) throw new Error("依頼が見つかりません");
  if (r.phase !== "completed") throw new Error("完了した依頼のみ申し込めます");
  if (r.cadence) throw new Error("すでに定期の依頼です");

  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    const now = new Date().toISOString();
    await admin.from("messages").insert({ thread_id: caseThread.id, sender_id: null, sender_role: null, kind: "notice", body: "依頼主が「次回からも定期でお願いしたい」と伝えています" });
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
  let session;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (e) {
    // Stripe側のエラー（無効なAPIキー等）はそのまま出すと英語になってしまうため、
    // 原因調査用にサーバーログへ残した上で日本語の案内に差し替える。
    console.error("startBalanceCharge: stripe.checkout.sessions.create failed:", e);
    throw new Error("決済ページを作成できませんでした");
  }
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
  let session;
  try {
    session = await stripe.checkout.sessions.create({
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
  } catch (e) {
    console.error("startAutoRechargeSetup: stripe.checkout.sessions.create failed:", e);
    throw new Error("設定ページを作成できませんでした");
  }
  if (!session.url) throw new Error("設定ページを作成できませんでした");
  return session.url;
}

export async function disableAutoRecharge() {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_auto_recharge");
  if (error) throw error;
}

// 担当マネージャーには見えない、本部（owner）直通の簡易チャット。
// kind='hq' のスレッドを自分の customer_id で1つだけ使う（窓口は関係ない）。
export async function getHqThread() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("kind", "hq")
    .eq("customer_id", ctx.customerId)
    .maybeSingle();
  if (!thread) return { messages: [] as { id: string; senderRole: string | null; body: string; sentAt: string }[] };
  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_role, body, sent_at, deleted_at")
    .eq("thread_id", thread.id)
    .order("sent_at", { ascending: true });
  return {
    messages: (messages ?? [])
      .filter((m) => !m.deleted_at)
      .map((m) => ({ id: m.id, senderRole: m.sender_role, body: m.body ?? "", sentAt: m.sent_at })),
  };
}

export async function sendHqMessage(body: string) {
  const ctx = await requireActiveContext();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("内容を入力してください");
  const admin = createServiceRoleClient();

  const { data: existing } = await admin
    .from("threads")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("kind", "hq")
    .eq("customer_id", ctx.customerId)
    .maybeSingle();
  let threadId = existing?.id as string | undefined;
  if (!threadId) {
    const { data: created, error } = await admin.from("threads").insert({ org_id: ctx.orgId, kind: "hq", customer_id: ctx.customerId }).select("id").single();
    if (error || !created) throw error ?? new Error("送信できませんでした");
    threadId = created.id;
  }

  const now = new Date().toISOString();
  const { error: msgError } = await admin.from("messages").insert({ thread_id: threadId, sender_id: ctx.userId, sender_role: "client", kind: "text", body: trimmed, sent_at: now });
  if (msgError) throw msgError;
  await admin.from("threads").update({ last_msg_at: now }).eq("id", threadId);
}

