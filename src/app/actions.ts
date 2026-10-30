"use server";

import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCustomerContext } from "@/lib/data";
import { notifyNewInquiry, notifyStaffPaymentConfirmed } from "@/lib/notify";
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

// 問い合わせ窓口（/teera など）でメールのリンクを送ったときは、リンクを開いた
// あとも同じ窓口に戻す（auth/confirm がこの cookie を見て振り分ける）。
async function rememberReturnPath() {
  const h = await headers();
  const slug = h.get("x-vid-desk-slug");
  const store = await cookies();
  if (slug) {
    const secure = !h.get("host")?.startsWith("localhost");
    store.set("vid_next", `/${slug}`, { httpOnly: true, sameSite: "lax", secure, maxAge: 60 * 60 * 24, path: "/" });
  } else {
    store.delete("vid_next");
  }
}

// 本番の Next.js は Server Action で throw されたエラー文を画面に渡さない
// （情報漏れ防止のため汎用の文言に置き換わる）。ログイン・パスワード・
// メアド変更のように「何が悪かったか」を本人に伝えたいものは、こちらで
// 包んで戻り値として返す。日本語の文言だけをそのまま返し、それ以外の
// 想定外のエラーはログに残して空文字（＝呼び出し側の既定の文言）にする。
type ActionResult = { error: string | null };
async function toResult(label: string, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { error: null };
  } catch (e) {
    // DB の関数が日本語で raise したエラー（残高不足・期限切れなど）は
    // Error ではなく { message } の形で届くので、そちらも見る。
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "";
    if (/[ぁ-んァ-ヶ一-龠]/.test(msg)) return { error: msg };
    console.error(label, e);
    return { error: "" };
  }
}

// メッセージを送るたびに呼ぶ。これを忘れると threads.last_msg_at が
// 依頼主側の新着で更新されず、受付側の未読判定が効かなくなる。
// threads の RLS は受付（is_office()）にしか update を許可していないため、
// 依頼主自身のセッションではこの更新が黙って0件のまま失敗する — service role
// で書く（last_msg_at を進めるだけの安全な操作なので、ここだけRLSを迂回する）。
//
// 更新の直前の状態（前回の last_msg_at／last_read_at）を見て、「本部が
// 読んだ後に初めて届いた1通」かどうかを返す。未読のまま連続でメッセージが
// 来た場合は2通目以降 false になり、notifyNewInquiry 側で毎通メールしない
// ようにするため（本当に最初の問い合わせ時は前回のメッセージが無いので true）。
async function touchThread(threadId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  const { data: before } = await admin.from("threads").select("last_msg_at, last_read_at").eq("id", threadId).maybeSingle();
  await admin.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
  if (!before || before.last_msg_at == null) return true;
  const alreadyUnread = before.last_read_at == null || before.last_read_at < before.last_msg_at;
  return !alreadyUnread;
}

// 依頼主がトーク画面を見ている間に呼ぶ。本部側の notifyCustomerNewMessage が
// 「依頼主が読んだ後に初めて届いた1通」だけメールするための既読時刻。
// threads の update は受付にしか RLS で許可していないため service role で書く
// （自分のスレッドの既読時刻を進めるだけの安全な操作）。
export async function markChatRead() {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();
  await admin.from("threads").update({ customer_last_read_at: new Date().toISOString() }).eq("id", ctx.threadId);
}

// 既存アカウントへのログイン（マジックリンク）。今の匿名セッションのトーク内容は
// 引き継がれない — 呼び出し側（UI）で事前に確認を取ってから呼ぶこと。
// resetPassword: ログイン画面の「パスワードをお忘れの方」から。リンクを開いて
// ログインしたあと、マイページのパスワード設定をそのまま開く（auth/confirm が
// この cookie を見て振り分ける）。
export async function requestMagicLink(email: string, opts?: { resetPassword?: boolean }) {
  return toResult("requestMagicLink", () => requestMagicLinkInner(email, opts));
}

async function requestMagicLinkInner(email: string, opts?: { resetPassword?: boolean }) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("メールアドレスをご入力ください");
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  await rememberReturnPath();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    // 既存アカウントへのログイン専用。true にすると初見のメールアドレスでも
    // 新規ユーザーが作られてしまい、customers 行を持たない空アカウントに
    // なってしまう（新規登録は決済画面の別フローで行う）。
    options: { emailRedirectTo: `${protocol}://${host}/auth/confirm`, shouldCreateUser: false },
  });
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) throw new Error("短時間に何度も送信されたため、少し時間をおいてからお試しください。");
    if (error.code === "otp_disabled" || /signups? not allowed/i.test(error.message)) {
      throw new Error("このメールアドレスのご登録が見つかりませんでした。初めてのご利用の場合は「はじめてご利用の方」から登録してください。");
    }
    console.error("requestMagicLink", error.code, error.message);
    throw new Error("送信できませんでした。しばらくしてからもう一度お試しください。");
  }
  if (opts?.resetPassword) {
    (await cookies()).set("vid_setpw", "1", { httpOnly: true, sameSite: "lax", secure: protocol === "https", maxAge: 60 * 60, path: "/" });
  } else {
    // 少し前に「パスワードをお忘れの方」を押していても、ふつうのログインでは
    // パスワード設定の画面を開かない。
    (await cookies()).delete("vid_setpw");
  }
}

// 任意で設定できるパスワードでのログイン。基本はマジックリンクで、パスワードは
// メールを開かずに入りたい人のための選択肢。忘れた場合はマジックリンクで入り、
// マイページから設定し直してもらう（再設定メールの仕組みは持たない）。
export async function signInWithPasswordLogin(email: string, password: string) {
  return toResult("signInWithPasswordLogin", () => signInWithPasswordLoginInner(email, password));
}

async function signInWithPasswordLoginInner(email: string, password: string) {
  const trimmed = email.trim();
  if (!trimmed || !password) throw new Error("メールアドレスとパスワードをご入力ください");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
  if (error) {
    if (error.status === 429) throw new Error("短時間に何度も試されたため、少し時間をおいてからお試しください。");
    throw new Error("メールアドレスかパスワードが正しくありません");
  }
  (await cookies()).delete("vid_setpw");
}

// パスワードを設定済みかどうかは Supabase 側で取れないので user_metadata に印を残す。
export async function setLoginPassword(password: string) {
  return toResult("setLoginPassword", () => setLoginPasswordInner(password));
}

const STAFF_ACCOUNT_MESSAGE = "本部画面と共用のアカウントのため、こちらでは変更できません。本部画面のアカウント設定から変更してください。";

async function setLoginPasswordInner(password: string) {
  const ctx = await requireContext();
  if (ctx.isAnonymous) throw new Error("認証されていません");
  if (ctx.isStaffAccount) throw new Error(STAFF_ACCOUNT_MESSAGE);
  if (password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } });
  if (error) {
    if (error.code === "same_password") throw new Error("現在と同じパスワードです");
    if (error.code === "weak_password") {
      const reasons = (error as { reasons?: string[] }).reasons ?? [];
      if (reasons.includes("pwned")) throw new Error("過去に流出したことのあるパスワードのため使えません。ほかでは使っていない、別のパスワードにしてください。");
      throw new Error("推測されやすいパスワードです。別のものにしてください。");
    }
    if (error.code === "reauthentication_needed") throw new Error("安全のため、一度ログアウトしてメールのリンクから入り直してから設定してください");
    console.error("setLoginPassword", error.code, error.message);
    throw new Error("設定できませんでした。しばらくしてからもう一度お試しください。");
  }
}

// パスワードをやめて、マジックリンクだけに戻す。Supabase にはパスワードを消す
// 操作がないため、誰も知らないランダムな値に置き換えて実質的に無効にする。
export async function removeLoginPassword() {
  return toResult("removeLoginPassword", removeLoginPasswordInner);
}

async function removeLoginPasswordInner() {
  const ctx = await requireContext();
  if (ctx.isAnonymous) throw new Error("認証されていません");
  if (ctx.isStaffAccount) throw new Error(STAFF_ACCOUNT_MESSAGE);
  const admin = createServiceRoleClient();
  const { data: current } = await admin.auth.admin.getUserById(ctx.userId);
  const email = current.user?.email;
  if (!email) throw new Error("認証されていません");
  const random = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(ctx.userId, {
    password: random,
    user_metadata: { ...(current.user?.user_metadata ?? {}), has_password: false },
  });
  if (error) {
    console.error("removeLoginPassword", error.code, error.message);
    throw new Error("操作できませんでした。しばらくしてからもう一度お試しください。");
  }
  // パスワードを置き換えるとログイン中のセッションも切られるため、本人の
  // ログインをこの場で張り直す（メールは送らない。リンクを発行してすぐ使う）。
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties?.hashed_token) {
    console.error("removeLoginPassword relogin", linkErr);
    return;
  }
  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({ type: "email", token_hash: link.properties.hashed_token });
  if (verifyErr) console.error("removeLoginPassword relogin", verifyErr.code, verifyErr.message);
}

export async function sendMessage(text: string, attachments: { path: string; name: string; mime: string; bytes: number }[]) {
  return toResult("sendMessage", () => sendMessageInner(text, attachments));
}

async function sendMessageInner(text: string, attachments: { path: string; name: string; mime: string; bytes: number }[]) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = text.trim();
  if (!trimmed && attachments.length === 0) return;

  if (attachments.length > 0) {
    // 自分のトークのフォルダ（threadId/…）に上げたファイルだけ受け付ける。
    if (attachments.some((a) => !a.path.startsWith(`${ctx.threadId}/`) || a.path.includes(".."))) throw new Error("添付ファイルを送れませんでした。もう一度お試しください。");
    const { data: filesMsg, error } = await supabase
      .from("messages")
      .insert({ thread_id: ctx.threadId, sender_id: ctx.userId, sender_role: "client", kind: "files" })
      .select("id")
      .single();
    if (error) throw error;
    const { error: attachError } = await supabase.from("message_attachments").insert(
      attachments.map((a) => ({ message_id: filesMsg.id, file_path: a.path, file_name: a.name, mime: a.mime, bytes: a.bytes })),
    );
    if (attachError) {
      // 中身のないファイルの吹き出しだけが残らないよう、作った行を消す。
      await createServiceRoleClient().from("messages").delete().eq("id", filesMsg.id);
      throw new Error("添付ファイルを送れませんでした。もう一度お試しください。");
    }
  }
  if (trimmed) {
    const { error } = await supabase
      .from("messages")
      .insert({ thread_id: ctx.threadId, sender_id: ctx.userId, sender_role: "client", kind: "text", body: trimmed });
    if (error) throw error;
  }
  const shouldNotify = await touchThread(ctx.threadId);
  if (shouldNotify) await notifyNewInquiry(ctx.orgId, ctx.threadId);
}

// 見積もりの「はじめの質問」（menu_pick）と同じく、その場のメッセージとしてのみ残す。
// 依頼主ごとの永続データ（customer_vault_items＝マイページの「よく使う情報」）には繋げない
// —— 確認事項テンプレはあくまで一回きりのやり取りとして扱う。
export async function submitInfoRequestAnswer(formLabel: string, fields: { label: string; value: string }[], requestMessageId: string) {
  return toResult("submitInfoRequestAnswer", () => submitInfoRequestAnswerInner(formLabel, fields, requestMessageId));
}

async function submitInfoRequestAnswerInner(formLabel: string, fields: { label: string; value: string }[], requestMessageId: string) {
  const ctx = await requireContext();
  const filled = fields.filter((f) => f.value.trim());
  if (!filled.length) throw new Error("1つ以上ご入力ください");
  const supabase = await createClient();
  // 読み込み直したあとに同じ確認事項へ二重に答えないようにする。
  const { data: already } = await supabase
    .from("messages")
    .select("id")
    .eq("thread_id", ctx.threadId)
    .eq("kind", "intake_answer")
    .eq("payload->>requestMessageId", requestMessageId)
    .limit(1);
  if (already?.length) throw new Error("この確認事項はすでに送信済みです");
  const { error } = await supabase.from("messages").insert({
    thread_id: ctx.threadId,
    sender_id: ctx.userId,
    sender_role: "client",
    kind: "intake_answer",
    payload: { formLabel, rows: filled, requestMessageId },
  });
  if (error) throw error;
  const shouldNotify = await touchThread(ctx.threadId);
  if (shouldNotify) await notifyNewInquiry(ctx.orgId, ctx.threadId);
}

// 依頼主本人の名前はいつでも自由に変更できる（customers_self_update ポリシー）。
// 社内向け（書類の宛名など）の呼び方は、本人のこの変更とは独立した
// customers.staff_label（本部・マネージャーが設定）を使う。
export async function updateCustomerName(name: string) {
  return toResult("updateCustomerName", () => updateCustomerNameInner(name));
}

async function updateCustomerNameInner(name: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("お名前をご入力ください");
  const { error } = await supabase.from("customers").update({ name: trimmed }).eq("id", ctx.customerId);
  if (error) throw error;
}

export async function setInitialProfile(name: string, email: string, phone: string, agreedToTerms: boolean) {
  return toResult("setInitialProfile", () => setInitialProfileInner(name, email, phone, agreedToTerms));
}

async function setInitialProfileInner(name: string, email: string, phone: string, agreedToTerms: boolean) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName || !trimmedEmail) throw new Error("お名前とメールアドレスをご入力ください");
  // クライアント側のチェックボックスだけに頼らず、サーバー側でも必ず確認する。
  if (!agreedToTerms) throw new Error("利用規約への同意が必要です");

  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  // リダイレクト先を明示しないと、Supabaseプロジェクト共通の既定（Site URL）に
  // 飛んでしまい、今アクセスしているドメインと食い違うことがある。
  await rememberReturnPath();
  const { error: emailErr } = await supabase.auth.updateUser({ email: trimmedEmail }, { emailRedirectTo: `${protocol}://${host}/auth/confirm` });
  if (emailErr) {
    // Supabaseのバージョンによってエラーコードの付き方が変わり、コードが
    // 付かない場合もあるため、コードに加えて英語メッセージ中の
    // "already"（already registered / already exists 等）も拾う。
    // こうしないと素通りして、意味の分からない汎用エラーになってしまう。
    const code = emailErr.code ?? "";
    if (code === "email_exists" || code === "user_already_exists" || code.includes("already") || /already/i.test(emailErr.message)) {
      throw new Error("このメールアドレスは既に登録されています。すでにご利用の方は「ログイン」をお試しください。");
    }
    throw emailErr;
  }

  // 名前と規約への同意は、メールアドレスが受け付けられてから保存する。先に保存すると、
  // 登録済みのアドレスで弾かれたときに、名前だけ付いた仮の依頼主が本部の一覧に残ってしまう。
  await supabase.from("customers").update({ name: trimmedName, terms_accepted_at: new Date().toISOString() }).eq("id", ctx.customerId);

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

// メールアドレスの変更は「新しいアドレスの確認だけ」で完了する（Supabase の
// Secure email change はオフ。前のアドレスがもう使えない人でも変えられるように）。
// 代わりに、パスワードを設定している人は変更時にパスワードを確認し、変更後は
// 前のアドレスへお知らせを送る（auth/confirm → notifyEmailChanged）。
export async function changeEmail(newEmail: string, password?: string) {
  return toResult("changeEmail", () => changeEmailInner(newEmail, password));
}

async function changeEmailInner(newEmail: string, password?: string) {
  const ctx = await requireContext();
  if (ctx.isAnonymous) throw new Error("認証されていません");
  if (ctx.isStaffAccount) throw new Error(STAFF_ACCOUNT_MESSAGE);
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email) throw new Error("認証されていません");

  if (user.user_metadata?.has_password === true) {
    if (!password) throw new Error("パスワードをご入力ください");
    // 本人のセッションに影響しないよう、cookie を持たない使い捨てのクライアントで確かめる。
    const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: pwErr } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (pwErr) throw new Error("パスワードが正しくありません");
    await verifier.auth.signOut({ scope: "local" });
  }

  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  await rememberReturnPath();
  const { error } = await supabase.auth.updateUser(
    { email: newEmail.trim(), data: { prev_email: user.email } },
    { emailRedirectTo: `${protocol}://${host}/auth/confirm` },
  );
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      throw new Error("このメールアドレスは既に登録されています。");
    }
    if (error.status === 429) throw new Error("短時間に何度も送信されたため、少し時間をおいてからお試しください。");
    console.error("changeEmail", error.code, error.message);
    throw new Error("変更できませんでした。しばらくしてからもう一度お試しください。");
  }
}

export async function submitRating(requestId: string, stars: number, comment: string) {
  return toResult("submitRating", () => submitRatingInner(requestId, stars, comment));
}

async function submitRatingInner(requestId: string, stars: number, comment: string) {
  const ctx = await requireContext();
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error("星を選んでください");
  await assertOwnCompletedRequest(requestId, ctx.customerId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .insert({ request_id: requestId, customer_id: ctx.customerId, stars, comment: comment.trim() || null, skipped: false });
  // すでに評価済み（二重送信）なら、そのまま終わりにする。
  if (error && error.code !== "23505") throw error;
}

// 評価できるのは、自分の依頼で完了したものだけ。
async function assertOwnCompletedRequest(requestId: string, customerId: string) {
  const { data } = await createServiceRoleClient().from("requests").select("phase").eq("id", requestId).eq("customer_id", customerId).maybeSingle();
  if (!data || data.phase !== "completed") throw new Error("この依頼は評価できません");
}

export async function skipRating(requestId: string) {
  return toResult("skipRating", () => skipRatingInner(requestId));
}

async function skipRatingInner(requestId: string) {
  const ctx = await requireContext();
  await assertOwnCompletedRequest(requestId, ctx.customerId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .insert({ request_id: requestId, customer_id: ctx.customerId, stars: null, skipped: true });
  if (error && error.code !== "23505") throw error;
}

// チャージ残高からの支払い。二重消費を防ぐためのロック・検証はすべて
// pay_request_from_balance（DB側のsecurity definer関数）の中で行う。
export async function payFromBalance(requestId: string) {
  return toResult("payFromBalance", () => payFromBalanceInner(requestId));
}

async function payFromBalanceInner(requestId: string) {
  const ctx = await requireContext();
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
  return toResult("declineQuote", () => declineQuoteInner(requestId));
}

async function declineQuoteInner(requestId: string) {
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
  // 別のタブで支払いが同時に確定していたら上書きしない。
  const { data: declined } = await admin.from("requests").update({ phase: "declined", cancelled_at: now }).eq("id", requestId).eq("phase", "quoted").select("id");
  if (!declined?.length) throw new Error("この依頼はすでに決済が完了しているため、キャンセルできません");
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
  return toResult("requestRecurringFollowup", () => requestRecurringFollowupInner(requestId));
}

async function requestRecurringFollowupInner(requestId: string) {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();

  const { data: r, error } = await admin.from("requests").select("phase, cadence").eq("id", requestId).eq("customer_id", ctx.customerId).single();
  if (error || !r) throw new Error("依頼が見つかりません");
  if (r.phase !== "completed") throw new Error("完了した依頼のみ申し込めます");
  if (r.cadence) throw new Error("すでに定期の依頼です");

  const { data: caseThread } = await admin.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  if (caseThread) {
    const body = "依頼主が「次回からも定期でお願いしたい」と伝えています";
    // 読み込み直して何度押しても、秘書に同じお知らせを重ねて送らない。
    const { data: already } = await admin.from("messages").select("id").eq("thread_id", caseThread.id).eq("kind", "notice").eq("body", body).limit(1);
    if (already?.length) return;
    const now = new Date().toISOString();
    await admin.from("messages").insert({ thread_id: caseThread.id, sender_id: null, sender_role: null, kind: "notice", body });
    await admin.from("threads").update({ last_msg_at: now }).eq("id", caseThread.id);
  }
}

// チャージ残高の入金。Stripeの埋め込み型Checkout（ui_mode: "embedded_page"）用の
// client_secretを用意するだけで、残高はまだ一切動かさない。支払い完了は
// Webhook（route.ts）側のcheckout.session.completedで検知して残高に反映する
// （決済が実際に成立するまで反映しないことで、二重加算や未払いの加算を防ぐ）。
export async function startBalanceCharge(amountYen: number) {
  let clientSecret = "";
  const r = await toResult("startBalanceCharge", async () => {
    clientSecret = await startBalanceChargeInner(amountYen);
  });
  return { ...r, clientSecret };
}

async function startBalanceChargeInner(amountYen: number): Promise<string> {
  const ctx = await requireContext();
  if (!Number.isInteger(amountYen) || amountYen < 1000) throw new Error("チャージ額は1,000円以上で指定してください");

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
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
      redirect_on_completion: "never",
    });
  } catch (e) {
    // Stripe側のエラー（無効なAPIキー等）はそのまま出すと英語になってしまうため、
    // 原因調査用にサーバーログへ残した上で日本語の案内に差し替える。
    console.error("startBalanceCharge: stripe.checkout.sessions.create failed:", e);
    throw new Error("決済ページを作成できませんでした");
  }
  if (!session.client_secret) throw new Error("決済ページを作成できませんでした");
  return session.client_secret;
}

// 残高の自動チャージを設定する（有効化・変更は常にここを通る）。Stripeの
// Checkout（setupモード）でカードを確認・保存してもらい、実際の有効化・
// しきい値／金額の保存は Webhook 側（checkout.session.completed, mode=
// "setup"）で行う。既にstripe_customer_idがあればそれを使い回し、無ければ
// Stripe側に新しく作ってもらう。
export async function startAutoRechargeSetup(thresholdYen: number, amountYen: number) {
  let clientSecret = "";
  const r = await toResult("startAutoRechargeSetup", async () => {
    clientSecret = await startAutoRechargeSetupInner(thresholdYen, amountYen);
  });
  return { ...r, clientSecret };
}

async function startAutoRechargeSetupInner(thresholdYen: number, amountYen: number): Promise<string> {
  const ctx = await requireContext();
  if (!Number.isInteger(thresholdYen) || thresholdYen < 1) throw new Error("しきい値を入力してください");
  if (!Number.isInteger(amountYen) || amountYen < 1000) throw new Error("チャージ額は1,000円以上で指定してください");

  const supabase = await createClient();
  const { data: customer } = await supabase.from("customers").select("stripe_customer_id").eq("id", ctx.customerId).maybeSingle();

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
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
      redirect_on_completion: "never",
    });
  } catch (e) {
    console.error("startAutoRechargeSetup: stripe.checkout.sessions.create failed:", e);
    throw new Error("設定ページを作成できませんでした");
  }
  if (!session.client_secret) throw new Error("設定ページを作成できませんでした");
  return session.client_secret;
}

export async function disableAutoRecharge() {
  return toResult("disableAutoRecharge", () => disableAutoRechargeInner());
}

async function disableAutoRechargeInner() {
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
  return toResult("sendHqMessage", () => sendHqMessageInner(body));
}

async function sendHqMessageInner(body: string) {
  const ctx = await requireContext();
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

