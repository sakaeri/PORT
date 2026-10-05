"use server";

import { cookies } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { getOrCreateReferralCoupon, getStripe, markReferralCreditConsumed, pickAvailableReferralCredit } from "@/lib/stripe";
import { notifyCustomerCompletionReport, notifyCustomerQuoteCreated } from "@/lib/notify";
import type { StaffRole, SubscriptionCadence } from "@/lib/supabase/types";

// allowLocked: トライアル終了・支払い滞納などでソフトロック中でも許可したい操作
// （キャンセル処理や、支払い設定そのものなど）用。既定はロック中なら弾く。
async function requireContext(opts?: { allowLocked?: boolean }) {
  const ctx = await getStaffContext();
  if (!ctx) throw new Error("権限がありません");
  if (ctx.isLocked && !opts?.allowLocked) {
    throw new Error("お支払い状況の確認が必要です。ご利用の継続には「お支払い設定」からお手続きください。");
  }
  return ctx;
}

async function requireHq() {
  const ctx = await requireContext();
  if (!ctx.isHq) throw new Error("権限がありません");
  return ctx;
}

// スタッフ（dept_leader）は削除操作ができない役職。削除系のアクション全部
// でこれを呼ぶ（自分が送ったメッセージの削除も対象— 見積もりチャットの
// 削除は案件自体の完全削除につながるため）。
function requireDeletePermission(ctx: { role: string }) {
  if (ctx.role === "dept_leader") {
    throw new Error("削除はスタッフには許可されていません。本部メンバーまたは秘書にご依頼ください。");
  }
}

async function requireContextWithDelete(opts?: { allowLocked?: boolean }) {
  const ctx = await requireContext(opts);
  requireDeletePermission(ctx);
  return ctx;
}

// ============================================================
// PORT利用料の決済（Stripe）。オーナーのみ。支払い設定そのものなので
// ロック中（トライアル終了・支払い滞納）でも呼べる必要がある（allowLocked）。
// 席数（seats）は制作者機能が未実装のため常に0 — 今は基本料(base_fee)だけを
// 請求する。制作者機能ができたら席数分の従量課金の行を追加する。
// ============================================================
export async function startSubscriptionSetup() {
  const ctx = await requireContext({ allowLocked: true });
  if (ctx.role !== "owner" && !(ctx.isHq && ctx.role === "dept_manager")) {
    throw new Error("お支払い設定の変更は本部のみ行えます");
  }

  const stripe = getStripe();
  const supabase = await createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("base_fee, email, display_name, stripe_customer_id, stripe_subscription_id")
    .eq("id", ctx.orgId)
    .single();
  if (error || !org) throw error ?? new Error("事業者情報を取得できませんでした");

  const baseFee = org.base_fee;
  const productId = process.env.STRIPE_PRODUCT_ID;
  if (!productId) throw new Error("決済機能の準備ができていません。しばらくしてから再度お試しください。");

  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ name: org.display_name, email: org.email ?? undefined, metadata: { org_id: ctx.orgId } });
    customerId = customer.id;
    await supabase.from("organizations").update({ stripe_customer_id: customerId }).eq("id", ctx.orgId);
  }

  const admin = createServiceRoleClient();
  // 確定済みの紹介チケットが残っていれば、新規作成するサブスクリプションに
  // 最初から1ヶ月無料クーポンを組み込む（作成後にupdateすると初回請求には
  // 間に合わないため、作成時に渡す必要がある）。
  const availableCreditId = await pickAvailableReferralCredit(admin, ctx.orgId);
  const couponId = availableCreditId ? await getOrCreateReferralCoupon(stripe) : null;

  // confirmation_secret は latest_invoice を展開しただけでは含まれず、
  // "latest_invoice.confirmation_secret" まで明示的にexpandしないと
  // 返ってこない（invoiceが確定済み・請求額ありでもnullのままだった実例あり）。
  const createFreshSubscription = async () => {
    const sub = await stripe.subscriptions.create({
      customer: customerId!,
      items: [{ price_data: { currency: "jpy", product: productId, unit_amount: baseFee, recurring: { interval: "month" } } }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      ...(couponId ? { coupon: couponId } : {}),
      expand: ["latest_invoice.confirmation_secret"],
    });
    await supabase.from("organizations").update({ stripe_subscription_id: sub.id }).eq("id", ctx.orgId);
    return sub;
  };

  let subscription = org.stripe_subscription_id
    ? await stripe.subscriptions.retrieve(org.stripe_subscription_id, { expand: ["latest_invoice.confirmation_secret"] })
    : null;

  // すでに支払い済みで有効なら、カード入力フォームを出す必要はない
  // （Payment Elementのconfirmを"redirect: if_required"で行っても、
  // Webhookでplan_statusが反映されるまでの一瞬だけこの画面が再読み込みされる
  // ことがあるため、その場合は「既に完了しています」を返す）。
  if (subscription && (subscription.status === "active" || subscription.status === "trialing")) {
    return { status: "active" as const };
  }

  // 存在しない、または解約済み・期限切れなら新しく作り直す。
  // incomplete・past_due・unpaid などは既存のものをそのまま使い回す
  // （新しく作ると二重にサブスクリプションができてしまうため）。
  const needsFresh = !subscription || subscription.status === "canceled" || subscription.status === "incomplete_expired";
  if (needsFresh) {
    subscription = await createFreshSubscription();
    if (availableCreditId) await markReferralCreditConsumed(admin, availableCreditId);
  }
  if (!subscription) throw new Error("決済の準備に失敗しました");

  const invoice = subscription.latest_invoice;
  const clientSecret = invoice && typeof invoice === "object" ? invoice.confirmation_secret?.client_secret : null;
  if (!clientSecret) {
    // expand指定を変えても直らない場合の切り分け用に、invoiceの中身を全部出す。
    console.error("startSubscriptionSetup: confirmation_secret missing", {
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      invoiceRaw: JSON.stringify(invoice),
    });
    throw new Error("決済の準備に失敗しました");
  }

  return { status: "needs_payment" as const, clientSecret };
}

// org_write ポリシーは owner のみ更新可（reception は不可）。RLS は該当行が
// なければ黙って0件更新で終わるため、更新後に選択して件数で判定する。
// 依頼主に見える事業者名はこれだけ（正式名称・代表者名・住所・電話番号は
// どこにも表示に使っていないため、編集画面ごと廃止した）。
export async function updateOrgDisplayName(displayName: string) {
  const ctx = await requireContext();
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("表示名を入力してください");
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update({ display_name: trimmed }).eq("id", ctx.orgId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("この変更は本部メンバーのみ行えます");
}

// 受付メニューはFC展開時のブランド・料金統一のため本部限定。イレギュラーな
// 依頼は時間精算（見積もり作成時の「時間精算」モード）で個別に対応できる。
export async function createMenu(orgId: string) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .insert({ org_id: orgId, label: "新しいメニュー", price: null, payout: 0, lead_hours: 24, sort: 999 })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data.id;
}

export async function updateMenu(
  id: string,
  fields: { label: string; note: string; price: number | null; lead_hours: number; active: boolean; icon: string | null },
) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menus")
    .update({
      label: fields.label.trim(),
      note: fields.note.trim() || null,
      price: fields.price,
      lead_hours: fields.lead_hours,
      active: fields.active,
      icon: fields.icon,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMenu(id: string) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { error } = await supabase.from("menus").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// ログイン情報（この管理画面に入るためのメール・パスワード。書類には使わない）
// ============================================================
export async function updateLoginEmail(newEmail: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      throw new Error("このメールアドレスは既に登録されています。");
    }
    throw error;
  }
}

export async function updateLoginPassword(currentPassword: string, newPassword: string) {
  await requireContext();
  if (newPassword.length < 8) throw new Error("新しいパスワードは8文字以上にしてください");
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.email) throw new Error("ログイン情報を確認できませんでした");
  const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: userData.user.email, password: currentPassword });
  if (reauthErr) throw new Error("現在のパスワードが違います");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ============================================================
// 返信テンプレ（トークからワンタップで送る定型文。項目を付けると入力フォームになる）
// ============================================================
export async function createIntakeForm(orgId: string) {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intake_forms")
    .insert({ org_id: orgId, label: "新しいテンプレ", sort: 999 })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data.id;
}

export async function updateIntakeForm(id: string, fields: { label: string; note: string }) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("intake_forms")
    .update({ label: fields.label.trim(), note: fields.note.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteIntakeForm(id: string) {
  await requireContextWithDelete();
  const supabase = await createClient();
  const { error } = await supabase.from("intake_forms").delete().eq("id", id);
  if (error) throw error;
}

export async function addIntakeField(formId: string, sort: number) {
  await requireContext();
  const supabase = await createClient();
  const key = `field_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await supabase
    .from("intake_fields")
    .insert({ form_id: formId, key, label: "", kind: "text", sort })
    .select("id, key")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data;
}

export async function updateIntakeField(id: string, fields: { label: string; kind: string }) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("intake_fields").update({ label: fields.label.trim(), kind: fields.kind }).eq("id", id);
  if (error) throw error;
}

export async function deleteIntakeField(id: string) {
  await requireContextWithDelete();
  const supabase = await createClient();
  const { error } = await supabase.from("intake_fields").delete().eq("id", id);
  if (error) throw error;
}

// 完了報告でよく使う項目名（プリセット）。メニューごとに持つ。スタッフが報告を
// 書くとき、ここから選んでワンタップで項目を追加できる（自由な項目追加
// もできるが、何を報告すべきか迷わないための定型的な選択肢）。
export async function createReportFieldPreset(menuId: string, label: string, sort: number) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_field_presets")
    .insert({ menu_id: menuId, label: label.trim() || "新しい項目", sort })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data.id;
}

export async function updateReportFieldPreset(id: string, patch: { label?: string; kind?: string; required?: boolean }) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const update: { label?: string; kind?: string; required?: boolean } = {};
  if (patch.label !== undefined) {
    const trimmed = patch.label.trim();
    if (!trimmed) throw new Error("項目名を入力してください");
    update.label = trimmed;
  }
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.required !== undefined) update.required = patch.required;
  const { error } = await supabase.from("report_field_presets").update(update).eq("id", id);
  if (error) throw error;
}

// 依頼主向けの利用規約（/terms）の本文。契約書を個別に結ばない代わりに
// 新規登録時の同意対象になる文章なので、編集は本部限定にする。
export async function updateOrgTerms(orgId: string, content: string) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ terms_content: content }).eq("id", orgId);
  if (error) throw error;
}

export async function deleteReportFieldPreset(id: string) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { error } = await supabase.from("report_field_presets").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// 新規事業者アカウント作成（PORT本部のみ）
// ============================================================
interface OrgFields {
  name: string;
  display_name: string;
  rep_name: string;
  tel: string;
  email: string;
  slug: string;
}

interface OrgAccountFields extends OrgFields {
  owner_email: string;
  owner_password: string;
  owner_display_name: string;
}

function validateSlug(rawSlug: string) {
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || slug === "auth") {
    throw new Error("URLの合言葉は半角英数字とハイフンのみ・2〜40文字で入力してください");
  }
  return slug;
}

// 事業者の行＋既定のキャンセル/返金ポリシーを作るだけの部分。オーナーの
// ログインをどう用意するか（新規作成 or 今のログインに追加）は呼び出し側で分ける。
// 人間秘書の契約が決まってから本部が作るアカウントなので、無料トライアルは
// 挟まず最初から契約中（active）として作る。支払いが滞ったら本部が
// setOrgLockState で手動でロックする。
async function createOrgRow(fields: OrgFields, admin: ReturnType<typeof createServiceRoleClient>) {
  const slug = validateSlug(fields.slug);
  if (!fields.display_name.trim()) {
    throw new Error("表示名は必須です");
  }
  // 正式名称は「窓口を追加」系の簡易フォームでは入力欄自体を出していないため、
  // 空欄なら表示名をそのまま使う。あとから会社情報タブで正式なものに直せる。
  const name = fields.name.trim() || fields.display_name.trim();

  const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (existing) throw new Error("このURLの合言葉はすでに使われています");

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name,
      display_name: fields.display_name.trim(),
      rep_name: fields.rep_name.trim() || null,
      tel: fields.tel.trim() || null,
      email: fields.email.trim() || null,
      slug,
      solo: true,
      plan_status: "active",
    })
    .select("id")
    .single();
  if (orgErr || !org) throw orgErr ?? new Error("事業者を作成できませんでした");

  return { orgId: org.id as string, slug };
}

async function createOrgCore(fields: OrgAccountFields) {
  if (fields.owner_password.length < 8) {
    throw new Error("パスワードは8文字以上にしてください");
  }
  if (!fields.owner_email.trim()) {
    throw new Error("オーナーのメールアドレスは必須です");
  }

  const admin = createServiceRoleClient();

  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email: fields.owner_email.trim(),
    password: fields.owner_password,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    throw new Error(userErr?.message.includes("already been registered") ? "このメールアドレスはすでに使われています" : (userErr?.message ?? "アカウントを作成できませんでした"));
  }
  const userId = userRes.user.id;

  // 連絡用メールアドレスが空欄なら、ログインメールアドレスをそのまま代わりに
  // 使う（Stripeの領収書送付先にもなる）。あとから会社情報タブで正式な
  // ものに直せる。正式名称の表示名からのフォールバックは createOrgRow 側で行う。
  const orgFields = {
    ...fields,
    email: fields.email.trim() || fields.owner_email.trim(),
  };

  let result: { orgId: string; slug: string };
  try {
    result = await createOrgRow(orgFields, admin);
  } catch (e) {
    await admin.auth.admin.deleteUser(userId);
    throw e;
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    org_id: result.orgId,
    role: "owner",
    display_name: fields.owner_display_name.trim() || fields.rep_name.trim() || fields.display_name.trim(),
  });
  if (profileErr) {
    await admin.from("organizations").delete().eq("id", result.orgId);
    await admin.auth.admin.deleteUser(userId);
    throw profileErr;
  }

  return result;
}

export async function createOrgAccount(fields: OrgAccountFields) {
  await requireHq();
  return createOrgCore(fields);
}

// 依頼主一覧の問い合わせ行から、そのままその依頼主を新しい事業者として
// 登録する。作成ロジックは createOrgAccount と共通（createOrgCore）で、
// 追加で customers.converted_org_id を紐付けて「どの問い合わせがどの事業者
// になったか」を追跡できるようにする。
export async function convertCustomerToOrg(customerId: string, fields: OrgAccountFields) {
  const ctx = await requireHq();
  const result = await createOrgCore(fields);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("customers")
    .update({ converted_org_id: result.orgId })
    .eq("id", customerId)
    .eq("org_id", ctx.orgId);
  if (error) throw error;

  return result;
}

// ============================================================
// 複数窓口（1つのログインで複数事業者のスタッフを兼任する）
// ============================================================

// 新しいログインを作らず、今ログイン中の自分をそのまま新しい事業者の
// オーナーとして追加する。事業者を複数運営したい人向け。owner だけに許可
// する（reception が勝手に窓口を増やせると困るため）。
// サイドバーの窓口切替。my_staff_orgs() に含まれる事業者かどうかはRLS側
// （auth_role()/is_office() が該当なしなら null/false になる）で担保される
// ため、ここでは単に選んだ事業者IDをCookieに保存するだけでよい。
export async function switchStaffOrg(orgId: string) {
  await requireContext();
  const jar = await cookies();
  jar.set("staff_org_id", orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

// staff_org_id が今消した事業者を指していたら、次回そのまま見に行って
// 「権限がありません」にならないよう、既定（自分のプロフィール本体の
// 事業者）に戻す。
async function clearStaffOrgCookieIfCurrent(orgId: string) {
  const jar = await cookies();
  if (jar.get("staff_org_id")?.value === orgId) jar.delete("staff_org_id");
}

// ログアウト時に呼ぶ。staff_org_id はhttpOnlyなのでクライアント側から消せず、
// signOut() だけでは残ってしまう。残ったまま別アカウントで再ログインすると、
// auth_org() がそのCookieの事業者IDを優先してしまい（新しいアカウントには
// その事業者への権限がないため）「受付画面の権限がありません」になる。
export async function clearStaffOrgCookie() {
  const jar = await cookies();
  jar.delete("staff_org_id");
}

// 事業者の完全削除（PORT本部のみ）。他社の事業者を丸ごと畳むためのもの。
// organizations 以下は on delete cascade で依頼主・案件・トークなど全て
// 連鎖削除される。専用のオーナーログイン（事業者管理・依頼主変換で作った
// もの）があれば、その auth ユーザーごと削除して迷子のログインを残さない。
export async function deleteOrgForHq(orgId: string) {
  await requireHq();
  const admin = createServiceRoleClient();

  const { data: primaryProfile } = await admin.from("profiles").select("id").eq("org_id", orgId).maybeSingle();

  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  if (error) throw error;

  if (primaryProfile) await admin.auth.admin.deleteUser(primaryProfile.id);
  await clearStaffOrgCookieIfCurrent(orgId);
}

// マネージャー（FC）からのロイヤリティ等の未払いを、本部が手動でロック/解除する。
// 自動トライアル失効の代わりに、この手動フラグだけで isLocked を制御する
// （getStaffContext の isLocked 判定は元々 plan_status を見ているので、
// ここでは active⇄paused を切り替えるだけでよい）。
export async function setOrgLockState(orgId: string, locked: boolean) {
  await requireHq();
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("organizations")
    .update({ plan_status: locked ? "paused" : "active" })
    .eq("id", orgId);
  if (error) throw error;
}

// 依頼主から本部への「ご意見・ご要望」を既読にする。
export async function markHqFeedbackRead(feedbackId: string) {
  await requireHq();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("hq_feedback").update({ read_at: new Date().toISOString() }).eq("id", feedbackId);
  if (error) throw error;
}

// チャージ残高の手動調整。キャンセル時の返金（未着手・著しい遅延以外の、
// 本部側の責任による個別対応）をチャージ残高へのクレジットとして戻したい
// 時や、金額の訂正に使う。マイナスも可（誤加算の取り消しなど）。
// 現金での返金ではなく残高への戻しにする（資金決済法上、前払い残高の
// 現金払い戻しは原則できないため、ルール上もこの形が自然）。
export async function adjustCustomerBalance(customerId: string, amount: number, note: string) {
  const ctx = await requireManagerOrAbove();
  if (!Number.isInteger(amount) || amount === 0) throw new Error("金額を入力してください");
  const admin = createServiceRoleClient();

  const { data: customer } = await admin.from("customers").select("balance").eq("id", customerId).eq("org_id", ctx.orgId).maybeSingle();
  if (!customer) throw new Error("依頼主が見つかりません");

  const { error: txError } = await admin.from("customer_balance_transactions").insert({
    customer_id: customerId,
    org_id: ctx.orgId,
    amount,
    kind: amount > 0 ? "refund_credit" : "deduction",
  });
  if (txError) throw txError;

  const { error } = await admin.from("customers").update({ balance: customer.balance + amount }).eq("id", customerId).eq("org_id", ctx.orgId);
  if (error) throw error;

  if (note.trim()) {
    const { data: thread } = await admin.from("threads").select("id").eq("customer_id", customerId).eq("kind", "customer").maybeSingle();
    if (thread) {
      await admin.from("messages").insert({
        thread_id: thread.id,
        sender_id: null,
        sender_role: null,
        kind: "notice",
        body: `残高を調整しました（${amount > 0 ? "+" : ""}¥${amount.toLocaleString("ja-JP")}）：${note.trim()}`,
      });
      await admin.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", thread.id);
    }
  }
}

// staff_alias（スタッフ）と同じ発想：依頼主本人が自由に変えられる name とは
// 独立して、本部・マネージャーが社内向けに付ける呼び方。null に戻せば
// 依頼主本人の登録名の表示に戻る。
export async function updateCustomerStaffLabel(customerId: string, label: string) {
  const ctx = await requireManagerOrAbove();
  const admin = createServiceRoleClient();
  const trimmed = label.trim();
  const { error } = await admin.from("customers").update({ staff_label: trimmed || null }).eq("id", customerId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

// 「自分のログインで追加した窓口」をセルフサービスで削除する。今のログイン
// の本来の事業者（primary）は対象外（削除するとそのログイン自体が
// プロフィールを失って詰む）。staff_org_links 経由で追加した分だけ許可。
// ============================================================
// 依頼主とのトーク（受付側の閲覧・返信・整理）
// ============================================================

export async function sendStaffMessage(threadId: string, text: string) {
  const ctx = await requireContext();
  const trimmed = text.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: ctx.userId, sender_role: ctx.role, kind: "text", body: trimmed });
  if (error) throw error;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
}

// 依頼主一覧の未読マーク用。スタッフ共有ログインなので個人別ではなく
// スレッド単位で「最後に誰か見た時刻」を記録するだけでよい。
export async function markThreadRead(threadId: string) {
  await requireContext();
  const supabase = await createClient();
  await supabase.from("threads").update({ last_read_at: new Date().toISOString() }).eq("id", threadId);
}

// 自分が送ったメッセージだけ削除できる（RLS の messages_sender_delete でも
// 強制されるが、他人の分は0件更新になるだけで気付きにくいのでここで検知する）。
export async function deleteMessage(messageId: string) {
  const ctx = await requireContextWithDelete();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", ctx.userId)
    .select("id, kind, request_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("自分が送ったメッセージのみ削除できます");

  // 見積もりチャットを削除したら、フェーズに関わらずその見積もり自体も完全に削除する
  // （request_items・完了報告・評価・案件トーク・そのメッセージまでDBのon delete cascadeで一緒に消える）。
  // 削除の判断はチャット側で行う想定のため、ここでは残り実績の有無を問わない。
  const deleted = data[0];
  if (deleted.kind === "quote" && deleted.request_id) {
    await supabase.from("requests").delete().eq("id", deleted.request_id);
  }
}

// アーカイブ・削除は依頼主一覧の見た目にも反映する（customers.active）。
// アーカイブは元に戻せる（一覧の「非表示も表示」から見つけて戻せる）。
async function setCustomerActiveForThread(threadId: string, active: boolean) {
  const supabase = await createClient();
  const { data: thread } = await supabase.from("threads").select("customer_id").eq("id", threadId).maybeSingle();
  if (thread?.customer_id) await supabase.from("customers").update({ active }).eq("id", thread.customer_id);
}

export async function archiveThread(threadId: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("threads").update({ archived_at: new Date().toISOString() }).eq("id", threadId);
  if (error) throw error;
  await setCustomerActiveForThread(threadId, false);
}

// 話の内容が変わって担当窓口を切り替えたいとき用（人間秘書の担当交代と
// 同じ発想）。今このトークが見えているスタッフだけが切り替えられる
// （RLSのthreads_office_writeが、切り替え先ではなく「今の」窓口の閲覧権限を
// 見ているため、他窓口のトークを勝手に奪うことはできない）。
export async function reassignThreadDepartment(threadId: string, departmentId: string | null) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("threads")
    .update({ department_id: departmentId })
    .eq("id", threadId)
    .eq("org_id", ctx.orgId)
    .eq("kind", "customer");
  if (error) throw error;
}

export async function unarchiveThread(threadId: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("threads").update({ archived_at: null }).eq("id", threadId);
  if (error) throw error;
  await setCustomerActiveForThread(threadId, true);
}

// 案件トーク（kind='case'）のアーカイブ。依頼主のアーカイブと違い customers.active には触れない。
export async function archiveCaseThread(threadId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("threads").update({ archived_at: new Date().toISOString() }).eq("id", threadId).eq("org_id", ctx.orgId).eq("kind", "case");
  if (error) throw error;
}

export async function unarchiveCaseThread(threadId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("threads").update({ archived_at: null }).eq("id", threadId).eq("org_id", ctx.orgId).eq("kind", "case");
  if (error) throw error;
}

// 依頼主を丸ごと完全削除する（一覧の「削除」用）。トーク・メッセージ・
// 添付・案件・評価・作業メモ・紹介record も customers への on delete
// cascade で連動して消える。アーカイブと違い元に戻せない。
export async function deleteCustomer(customerId: string) {
  const ctx = await requireContextWithDelete();
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

// 案件を丸ごと完全削除する（案件トーク一覧の「削除」用）。案件トーク・
// メッセージ・完了報告・評価・担当スタッフの割り当ても on delete cascade で
// 連動して消える。アーカイブと違い元に戻せない。入金済みの案件でも削除できて
// しまうため、呼び出し側で強めの確認を出す。
export async function deleteCaseRequest(requestId: string) {
  const ctx = await requireContextWithDelete();
  const supabase = await createClient();
  const { error } = await supabase.from("requests").delete().eq("id", requestId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

// ============================================================
// 案件（見積もり〜完了報告）。制作者への割り当ては次のフェーズで対応する
// ため、今は受付が代わりに着手・完了報告まで進める。
// ============================================================

export async function createCaseRequest(
  customerThreadId: string,
  customerId: string,
  input: {
    items: { menuId: string | null; label: string; price: number; payout: number; qty: number; leadHours?: number | null }[];
    note: string;
    due: string;
    saveAsMenu?: boolean;
    // メニューに無い依頼を時間精算にする場合。設定すると items は無視する。
    hourly?: { rate: number; cap: number; label: string };
    // 定期対応（毎週・毎月）にする場合。hourly とは併用不可。初回の支払いが
    // 確定するまでは定期対応としては動き出さない
    // （pay_request_from_balance 側で有効化する）。
    cadence?: SubscriptionCadence;
    // 曜日・日付の指定（任意）。無指定なら初回決済日からの単純な+7日／+1ヶ月。
    anchorWeekday?: number;
    anchorDayOfMonth?: number;
  },
) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const isHourly = !!input.hourly;
  const items = isHourly ? [] : input.items.filter((it) => it.qty > 0 && it.label.trim());
  if (!isHourly && items.length === 0) throw new Error("見積もりの項目を1つ以上追加してください");
  if (isHourly && (!input.hourly!.rate || !input.hourly!.cap)) throw new Error("時間単価と上限額を入力してください");

  const amount = isHourly ? input.hourly!.cap : items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const title = isHourly
    ? input.hourly!.label.trim() || "時間精算の依頼"
    : items.length > 2
      ? `${items[0].label}ほか${items.length - 1}件`
      : items.map((it) => it.label).join("・");
  // 着手時に納期（due_at）を計算するための作業時間の目安を保存しておく
  // （項目ごとの目安時間 × 数量。複数項目は並行して進む前提でmaxを取る）。
  // 時間精算案件は着手〜完了の実測で金額を決めるので目安自体は使わない。
  const knownLeadHours = items.map((it) => (it.leadHours != null ? it.leadHours * it.qty : null)).filter((h): h is number => h != null);
  const leadHoursTotal = isHourly || input.cadence ? null : knownLeadHours.length > 0 ? Math.max(...knownLeadHours) : null;

  if (!isHourly && input.saveAsMenu) {
    const customItems = items.filter((it) => !it.menuId);
    if (customItems.length > 0) {
      const { error: menuError } = await supabase
        .from("menus")
        .insert(customItems.map((it) => ({ org_id: ctx.orgId, label: it.label, price: it.price, payout: it.payout, lead_hours: it.leadHours ?? 24 })));
      if (menuError) throw menuError;
    }
  }

  const { data: request, error: reqError } = await supabase
    .from("requests")
    .insert({
      org_id: ctx.orgId,
      customer_id: customerId,
      title,
      note: input.note.trim() || null,
      amount,
      phase: "quoted",
      quoted_at: new Date().toISOString(),
      lead_hours: leadHoursTotal,
      payment_timing: "balance",
      hourly_rate: isHourly ? input.hourly!.rate : null,
      hourly_cap: isHourly ? input.hourly!.cap : null,
      cadence: input.cadence ?? null,
    })
    .select("id")
    .single();
  if (reqError || !request) throw reqError ?? new Error("案件の作成に失敗しました");

  if (!isHourly) {
    const { error: itemsError } = await supabase
      .from("request_items")
      .insert(items.map((it, i) => ({ request_id: request.id, menu_id: it.menuId, label: it.label, price: it.price, payout: it.payout, qty: it.qty, sort: i })));
    if (itemsError) throw itemsError;
  }

  // 定期対応の雛形を作っておく。初回の支払いが確定するまでは active=false
  // のままで、pay_request_from_balance が確定と同時に有効化する。
  if (input.cadence) {
    const { data: subscription, error: subError } = await supabase
      .from("request_subscriptions")
      .insert({
        org_id: ctx.orgId,
        customer_id: customerId,
        customer_thread_id: customerThreadId,
        title,
        note: input.note.trim() || null,
        amount,
        items: items.map((it) => ({ label: it.label, price: it.price, payout: it.payout, qty: it.qty })),
        cadence: input.cadence,
        anchor_weekday: input.cadence === "weekly" ? (input.anchorWeekday ?? null) : null,
        anchor_day_of_month: input.cadence === "monthly" ? (input.anchorDayOfMonth ?? null) : null,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (subError || !subscription) throw subError ?? new Error("定期対応の作成に失敗しました");
    await supabase.from("requests").update({ subscription_id: subscription.id }).eq("id", request.id);
  }

  const payload: Record<string, unknown> = { title, note: input.note.trim() || undefined, due: input.due.trim() || undefined };
  const { error: msgError } = await supabase.from("messages").insert({
    thread_id: customerThreadId,
    sender_id: ctx.userId,
    sender_role: ctx.role,
    kind: "quote",
    request_id: request.id,
    payload,
  });
  if (msgError) throw msgError;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", customerThreadId);

  // 制作者とのやり取り・進捗ログ用の案件トーク（今は担当者未定のまま作る）
  const { data: caseThread, error: caseThreadError } = await supabase
    .from("threads")
    .insert({ org_id: ctx.orgId, kind: "case", request_id: request.id, customer_id: customerId, last_msg_at: new Date().toISOString() })
    .select("id")
    .single();
  if (caseThreadError || !caseThread) throw caseThreadError ?? new Error("案件トークの作成に失敗しました");

  // sender_id=null（システム発）の行は messages_send の RLS (sender_id = auth.uid()) を
  // 通らないため、通知メッセージだけは service-role で書く。
  const admin = createServiceRoleClient();
  await admin.from("messages").insert({
    thread_id: caseThread.id,
    sender_id: null,
    sender_role: null,
    kind: "notice",
    body: `見積もりを送信しました（¥${amount.toLocaleString("ja-JP")}）`,
  });

  await notifyCustomerQuoteCreated(admin, ctx.orgId, customerId, amount, title);

  return request.id as string;
}

// 定期対応を停止する。すでに作られた（支払い済みの）案件には影響しない
// （着手・完了報告はそのまま進められる）。次回以降の自動作成・引き落としが
// 止まるだけ。
export async function cancelSubscription(subscriptionId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("request_subscriptions")
    .update({ active: false, cancelled_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("org_id", ctx.orgId);
  if (error) throw error;
}

async function getCaseThreadId(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string) {
  const { data } = await supabase.from("threads").select("id").eq("kind", "case").eq("request_id", requestId).maybeSingle();
  return data?.id ?? null;
}

// sender_id=null（システム発）の行は messages_send の RLS (sender_id = auth.uid()) を
// 通らないため service-role で書く。案件トークの検索自体は通常クライアントでよい。
async function postCaseNotice(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string, body: string) {
  const caseThreadId = await getCaseThreadId(supabase, requestId);
  if (!caseThreadId) return;
  const admin = createServiceRoleClient();
  await admin.from("messages").insert({ thread_id: caseThreadId, sender_id: null, sender_role: null, kind: "notice", body });
  await admin.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", caseThreadId);
}

// 残高払いで支払いが確定すると "preparing"（着手前）になる。そこから
// 実際に手を動かし始めるタイミングはここで担当者が決める。
export async function startCaseRequest(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: current, error: fetchError } = await supabase
    .from("requests")
    .select("phase, lead_hours")
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("phase", "preparing")
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!current) throw new Error("着手できる状態ではありません");

  const now = new Date().toISOString();
  // 着手した瞬間を起点に、社内タスク管理用の納期目安（due_at）を計算する。
  // 依頼主の入金待ちなどの時間は含めない（本人の対応が遅れないよう）。
  const dueAt = current.lead_hours != null ? new Date(Date.now() + current.lead_hours * 3600 * 1000).toISOString() : null;
  const { data, error } = await supabase
    .from("requests")
    .update({ phase: "started", started_at: now, due_at: dueAt })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("phase", "preparing")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("着手できる状態ではありません");
  await postCaseNotice(supabase, requestId, "着手しました");
}

// スタッフ（dept_leader）が提出した完了報告は、そのまま依頼主に送らず
// マネージャー・オーナーの確認待ち（下書き）にする。オーナー・マネージャー
// 自身が提出した場合は、自分の確認が要らないのでそのまま依頼主に送る。
export async function submitCaseReport(requestId: string, summary: string, details: { label: string; value: string }[]) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = summary.trim();
  if (!trimmed) throw new Error("完了報告の内容を入力してください");

  const { data: request } = await supabase.from("requests").select("id, phase, customer_id").eq("id", requestId).eq("org_id", ctx.orgId).maybeSingle();
  if (!request) throw new Error("案件が見つかりません");
  if (request.phase !== "started") throw new Error("着手中の案件のみ完了報告できます");

  const cleanDetails = details.filter((d) => d.label.trim() && d.value.trim()).map((d) => ({ label: d.label.trim(), value: d.value.trim() }));

  const canSendDirectly = ctx.role === "owner" || ctx.role === "dept_manager";
  const now = new Date().toISOString();
  const { error: reportError } = await supabase.from("completion_reports").insert({
    request_id: requestId,
    summary: trimmed,
    details: cleanDetails,
    submitted_at: now,
    sent_at: canSendDirectly ? now : null,
  });
  if (reportError) throw reportError;

  if (!canSendDirectly) {
    await postCaseNotice(supabase, requestId, "完了報告を提出しました（秘書の確認待ち）");
    return;
  }

  const { error: reqError } = await supabase.from("requests").update({ phase: "completed", completed_at: now }).eq("id", requestId).eq("org_id", ctx.orgId);
  if (reqError) throw reqError;
  // 時間精算案件なら、ここで着手〜完了の実働時間から最終金額を確定し、
  // 見積もり時に引き落とした上限額との差額をチャージ残高に戻す
  // （固定額案件（hourly_rateがnull）には何もしない）。
  await supabase.rpc("finalize_hourly_billing", { p_request_id: requestId });
  await postCaseNotice(supabase, requestId, "完了報告を送信しました");
  await notifyCustomerCompletionReport(createServiceRoleClient(), ctx.orgId, request.customer_id);
}

// スタッフが提出した完了報告（下書き）を、マネージャー・オーナーが確認して
// 依頼主に送る。
export async function approveCaseReport(requestId: string) {
  const ctx = await requireContext();
  if (ctx.role !== "owner" && ctx.role !== "dept_manager") throw new Error("この操作は本部メンバー・秘書のみ行えます");
  const supabase = await createClient();

  const { data: request } = await supabase.from("requests").select("id, phase, customer_id").eq("id", requestId).eq("org_id", ctx.orgId).maybeSingle();
  if (!request) throw new Error("案件が見つかりません");
  if (request.phase !== "started") throw new Error("確認待ちの完了報告が見つかりません");

  const now = new Date().toISOString();
  const { data: updatedReports, error: reportError } = await supabase
    .from("completion_reports")
    .update({ sent_at: now })
    .eq("request_id", requestId)
    .is("sent_at", null)
    .select("id");
  if (reportError) throw reportError;
  if (!updatedReports || updatedReports.length === 0) throw new Error("確認待ちの完了報告が見つかりません");

  const { error: reqError } = await supabase.from("requests").update({ phase: "completed", completed_at: now }).eq("id", requestId).eq("org_id", ctx.orgId);
  if (reqError) throw reqError;
  await supabase.rpc("finalize_hourly_billing", { p_request_id: requestId });
  await postCaseNotice(supabase, requestId, "完了報告を確認し、依頼主に送信しました");
  await notifyCustomerCompletionReport(createServiceRoleClient(), ctx.orgId, request.customer_id);
}

// 見積もり段階（まだ入金前）の見送り。費用が発生していないので即確定でよい。
export async function declineQuote(requestId: string) {
  const ctx = await requireContext({ allowLocked: true });
  const supabase = await createClient();

  const { data: r, error: fetchError } = await supabase.from("requests").select("phase").eq("id", requestId).eq("org_id", ctx.orgId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!r) throw new Error("案件が見つかりません");
  if (r.phase !== "quoted") throw new Error("この操作は見積もり段階のみ行えます");

  const now = new Date().toISOString();
  const { error } = await supabase.from("requests").update({ phase: "declined", cancelled_at: now }).eq("id", requestId).eq("org_id", ctx.orgId);
  if (error) throw error;
  await postCaseNotice(supabase, requestId, "受付が見積もりを見送りにしました");
}

// 案件トーク（スタッフ内メモ・進捗ログ）への書き込み。削除は deleteMessage を共用する
// （自分が送ったメッセージだけ削除できる、というチェックはメッセージの種類によらない）。
export async function sendCaseMessage(caseThreadId: string, text: string) {
  const ctx = await requireContext();
  const trimmed = text.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: caseThreadId, sender_id: ctx.userId, sender_role: ctx.role, kind: "text", body: trimmed });
  if (error) throw error;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", caseThreadId);
}

// スタッフ（dept_leader）は窓口所属だけでは案件が見えず、案件ごとに
// 個別に割り当てられて初めてその案件の社内トークにアクセスできる。
// 割り当て・解除ができるのはオーナー・マネージャー
// （RLS の case_staff_write でも強制される）。
export async function assignCaseStaff(requestId: string, profileId: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("case_staff").insert({ request_id: requestId, profile_id: profileId });
  if (error) throw error;
}

export async function unassignCaseStaff(requestId: string, profileId: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("case_staff").delete().eq("request_id", requestId).eq("profile_id", profileId);
  if (error) throw error;
}

// スタッフ⇄本部（オーナー・マネージャー）の1対1連絡チャット。スタッフ1人
// につき1本の thread（kind='internal'）を、初回アクセス時にその場で作る。
export async function ensureStaffThread(staffProfileId: string) {
  const ctx = await requireContext();
  if (staffProfileId !== ctx.userId && ctx.role !== "owner" && ctx.role !== "dept_manager") {
    throw new Error("権限がありません");
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("threads")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("kind", "internal")
    .eq("staff_profile_id", staffProfileId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("threads")
    .insert({ org_id: ctx.orgId, kind: "internal", staff_profile_id: staffProfileId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function sendInternalMessage(threadId: string, text: string) {
  const ctx = await requireContext();
  const trimmed = text.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: ctx.userId, sender_role: ctx.role, kind: "text", body: trimmed });
  if (error) throw error;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
}

// 項目付きテンプレ（intake_forms）を依頼主トークに intake_request として送る。
// 依頼主側の回答はその場のメッセージ（intake_answer）としてのみ残り、
// 依頼主ごとの永続データには繋がらない（見積もりの質問と同じ扱い）。
export async function sendTemplateMessage(threadId: string, templateId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("intake_forms")
    .select("id, label, note, intake_fields(key, label, kind, required, sort)")
    .eq("id", templateId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!form) throw new Error("テンプレが見つかりません");

  const fields = (form.intake_fields ?? [])
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((f) => ({ key: f.key, label: f.label, kind: f.kind, required: f.required }));
  if (fields.length === 0) throw new Error("このテンプレには項目がありません");

  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: ctx.userId,
    sender_role: ctx.role,
    kind: "intake_request",
    payload: { formLabel: form.label, note: form.note ?? undefined, fields },
  });
  if (error) throw error;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
}

// ============================================================
// 社内メモ（依頼主には一切見せない。担当制作者・受付のみ）
// ============================================================
export async function addWorkMemo(customerId: string, body: string) {
  const ctx = await requireContext();
  const trimmed = body.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase.from("work_memos").insert({ customer_id: customerId, author_id: ctx.userId, body: trimmed });
  if (error) throw error;
}

export async function deleteWorkMemo(id: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("work_memos").delete().eq("id", id).eq("author_id", ctx.userId);
  if (error) throw error;
}

// ============================================================
// 窓口（部署）とスタッフの役職管理
// ============================================================
// 組織は1つだけ。その中に窓口（department＝本部社員でもFCでも区別しない
// 「マネージャー」の単位）があり、各窓口にスタッフが所属する。役職は
// オーナー＝owner（窓口に紐付かず全窓口を横断できる、本部そのもの。
// 複数人いてよい）／マネージャー＝dept_manager（自分の窓口の依頼主対応・
// 自分のスタッフの採用や削除ができる、常にどこかの窓口に属する）／
// スタッフ＝dept_leader（案件ごとに割り当てられて社内トークで作業する、
// 依頼主とは直接やり取りしない・削除不可）の構成。
// dept_leader という値自体はDB上の名残で、表示・実際の役割は「スタッフ」。

// メニュー・価格・窓口構成など、全社共通の設定を変更できるのは本部
// （owner）だけ。マネージャー（dept_manager）は常に特定の窓口に属する
// 存在で、本部ではない — 複数人を本部にしたい場合は役職をownerにする
// （窓口に紐付かない、全窓口を横断できる唯一のロール）。
async function requireHqPrivileged() {
  const ctx = await requireContext();
  if (ctx.role !== "owner") {
    throw new Error("この操作は本部のみ行えます");
  }
  return ctx;
}

// 自分の窓口のスタッフの採用・削除・役職変更はマネージャーもできる
// （オーナーロールへの昇格はUI上も選択肢に無く、下でも明示的に弾く）。
async function requireManagerOrAbove() {
  const ctx = await requireContext();
  if (ctx.role !== "owner" && ctx.role !== "dept_manager") {
    throw new Error("この操作は秘書以上のみ行えます");
  }
  return ctx;
}

export async function updateMenuDepartment(menuId: string, departmentId: string | null) {
  const ctx = await requireHqPrivileged();
  const supabase = await createClient();
  const { error } = await supabase.from("menus").update({ department_id: departmentId }).eq("id", menuId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

// 本部が窓口（マネージャー）から取るロイヤリティの率。nullなら対象外
// （本部直轄の窓口など）。旧 setOrgRoyaltyPct は「事業者（organizations）」
// 単位だった頃の名残で、今は窓口単位のこちらに置き換わっている。
export async function setDepartmentRoyaltyPct(departmentId: string, pct: number | null) {
  const ctx = await requireHqPrivileged();
  if (pct != null && (pct < 0 || pct > 100)) throw new Error("0〜100の範囲で入力してください");
  const supabase = await createClient();
  const { error } = await supabase.from("departments").update({ royalty_pct: pct }).eq("id", departmentId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

async function replaceStaffDepartments(admin: ReturnType<typeof createServiceRoleClient>, profileId: string, departmentIds: string[]) {
  await admin.from("staff_departments").delete().eq("profile_id", profileId);
  if (departmentIds.length > 0) {
    const { error } = await admin.from("staff_departments").insert(departmentIds.map((department_id) => ({ profile_id: profileId, department_id })));
    if (error) throw error;
  }
}

async function departmentIdsOf(admin: ReturnType<typeof createServiceRoleClient>, profileId: string) {
  const { data } = await admin.from("staff_departments").select("department_id").eq("profile_id", profileId);
  return (data ?? []).map((d) => d.department_id as string);
}

// 窓口（department）はもうユーザーが作成・命名するものではなく、マネージャー
// 1人につき1つ自動でできるもの（「秘書：（表示名）」）。マネージャーに昇格
// した時点で窓口が無ければ新規作成し、既にあれば（以前の手動運用の名残）
// そのまま使う。
async function ensureManagerDepartment(admin: ReturnType<typeof createServiceRoleClient>, orgId: string, profileId: string, alias: string) {
  const existing = await departmentIdsOf(admin, profileId);
  if (existing.length > 0) return existing;
  const { data, error } = await admin.from("departments").insert({ org_id: orgId, name: `秘書：${alias}` }).select("id").single();
  if (error || !data) throw error ?? new Error("窓口を作成できませんでした");
  return [data.id as string];
}

// マネージャーでなくなった（役職変更・削除）ことで、窓口が誰のものでもなく
// なった場合は窓口ごと片付ける。他のマネージャーがまだ同じ窓口にいる場合は
// 残す（1つの窓口を複数人で持っている、以前からの運用も壊さないため）。
async function cleanupOrphanedDepartments(admin: ReturnType<typeof createServiceRoleClient>, departmentIds: string[]) {
  for (const departmentId of departmentIds) {
    const { data: members } = await admin.from("staff_departments").select("profile_id").eq("department_id", departmentId);
    const memberIds = (members ?? []).map((m) => m.profile_id);
    const stillHasManager =
      memberIds.length > 0 &&
      ((await admin.from("profiles").select("id", { count: "exact", head: true }).in("id", memberIds).eq("role", "dept_manager")).count ?? 0) > 0;
    if (!stillHasManager) await admin.from("departments").delete().eq("id", departmentId);
  }
}

// メールアドレス・パスワードをこちらで発行する代わりに、招待リンクを発行する。役職は
// ここでは決めず、参加後にチャット画面の歯車パネルから設定する（役職も
// あとで変更できるので、招待の時点で決め切る意味がない）。招待は常に
// 一番権限の小さいスタッフ（dept_leader）として作られる。マネージャーが
// 招待した場合は、そのまま自分の窓口のスタッフとして参加する（本部が
// 招待した場合は窓口未設定のまま＝あとで本部がどこかの窓口に割り当てる）。
export async function createStaffInvite() {
  const ctx = await requireManagerOrAbove();
  const admin = createServiceRoleClient();
  const departmentIds = ctx.role === "dept_manager" ? await departmentIdsOf(admin, ctx.userId) : [];
  const { data, error } = await admin
    .from("staff_invites")
    .insert({ org_id: ctx.orgId, role: "dept_leader", department_ids: departmentIds, created_by: ctx.userId })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("招待リンクを作成できませんでした");
  return data.id as string;
}

// /join/<id> ページから、まだ未ログインの状態で呼ばれる。招待リンクの
// 有効性チェックは acceptStaffInvite 側でも行う（このプレビューはUI表示用）。
export async function getInvitePreview(inviteId: string) {
  const admin = createServiceRoleClient();
  const { data: invite } = await admin
    .from("staff_invites")
    .select("role, used_at, organizations(display_name)")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return null;
  const org = Array.isArray(invite.organizations) ? invite.organizations[0] : invite.organizations;
  return { role: invite.role as StaffRole, valid: !invite.used_at, orgDisplayName: org?.display_name ?? "" };
}

export async function acceptStaffInvite(inviteId: string, fields: { email: string; password: string; displayName: string }) {
  if (fields.password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  if (!fields.email.trim()) throw new Error("メールアドレスは必須です");

  const admin = createServiceRoleClient();
  const { data: invite } = await admin
    .from("staff_invites")
    .select("id, org_id, role, department_ids, used_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) throw new Error("この招待リンクは無効です");
  if (invite.used_at) throw new Error("この招待リンクはすでに使われています");

  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email: fields.email.trim(),
    password: fields.password,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    throw new Error(userErr?.message.includes("already been registered") ? "このメールアドレスはすでに使われています" : (userErr?.message ?? "アカウントを作成できませんでした"));
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userRes.user.id,
    org_id: invite.org_id,
    role: invite.role,
    display_name: fields.displayName.trim() || fields.email.trim(),
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userRes.user.id);
    throw profileErr;
  }

  if (invite.department_ids.length > 0) {
    await admin.from("staff_departments").insert(invite.department_ids.map((department_id: string) => ({ profile_id: userRes.user.id, department_id })));
  }
  await admin.from("staff_invites").update({ used_at: new Date().toISOString(), used_by: userRes.user.id }).eq("id", inviteId);

  return { email: fields.email.trim() };
}

// alias はマネージャー（または本部）がこのスタッフに付ける社内向けの
// 呼び方。本人が自分で決める本当の表示名（profiles.display_name、
// updateMyDisplayName経由でしか変更できない）は書き換えない — LINEの
// ニックネームと同じ発想。役職の選択肢はUI（INVITE_ROLES）にも "owner" が
// 無いが、直接このアクションを呼ばれた場合の昇格を防ぐため、ここでも
// 明示的に弾く。マネージャーが操作できるのは「自分に割り当てられている
// スタッフ」だけ（本部が割り当てたスタッフも含む）で、役職をスタッフ以外
// に変更したり、自分以外の窓口に割り当てたりはできない。
// 窓口（department）はマネージャーに昇格した時点で自動的にできる
// （departmentIds はdept_leaderの所属窓口の指定にだけ使う）。
export async function updateStaffMember(profileId: string, role: StaffRole, departmentIds: string[], alias: string) {
  const ctx = await requireManagerOrAbove();
  if (role !== "dept_leader" && ctx.role !== "owner") throw new Error("この役職には変更できません");
  const trimmedAlias = alias.trim();
  if (!trimmedAlias) throw new Error("表示名を入力してください");
  const admin = createServiceRoleClient();

  const { data: targetBefore } = await admin.from("profiles").select("role").eq("id", profileId).eq("org_id", ctx.orgId).maybeSingle();
  const previousRole = targetBefore?.role as StaffRole | undefined;
  const previousDepartmentIds = await departmentIdsOf(admin, profileId);

  if (ctx.role === "dept_manager") {
    const myDepartmentIds = await departmentIdsOf(admin, ctx.userId);
    if (!previousDepartmentIds.some((id) => myDepartmentIds.includes(id))) throw new Error("自分に割り当てられているスタッフのみ操作できます");
    if (role === "dept_leader" && departmentIds.some((id) => !myDepartmentIds.includes(id))) throw new Error("自分の窓口以外には割り当てられません");
  }

  let resolvedDepartmentIds: string[];
  if (role === "owner") {
    resolvedDepartmentIds = [];
  } else if (role === "dept_manager") {
    resolvedDepartmentIds = await ensureManagerDepartment(admin, ctx.orgId, profileId, trimmedAlias);
  } else {
    resolvedDepartmentIds = departmentIds;
  }

  const { error } = await admin.from("profiles").update({ role, staff_alias: trimmedAlias }).eq("id", profileId).eq("org_id", ctx.orgId);
  if (error) throw error;
  await replaceStaffDepartments(admin, profileId, resolvedDepartmentIds);

  if (previousRole === "dept_manager" && role !== "dept_manager") {
    await cleanupOrphanedDepartments(admin, previousDepartmentIds);
  }
}

export async function removeStaffMember(profileId: string) {
  const ctx = await requireManagerOrAbove();
  if (profileId === ctx.userId) throw new Error("自分自身は削除できません");
  const admin = createServiceRoleClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", profileId).eq("org_id", ctx.orgId).maybeSingle();
  if (target?.role === "owner" && ctx.role !== "owner") throw new Error("この操作は本部のみ行えます");
  const targetDepartmentIds = await departmentIdsOf(admin, profileId);
  if (ctx.role === "dept_manager") {
    const myDepartmentIds = await departmentIdsOf(admin, ctx.userId);
    if (!targetDepartmentIds.some((id) => myDepartmentIds.includes(id))) throw new Error("自分に割り当てられているスタッフのみ削除できます");
  }
  const { error } = await admin.from("profiles").delete().eq("id", profileId).eq("org_id", ctx.orgId);
  if (error) throw error;
  await admin.auth.admin.deleteUser(profileId);
  if (target?.role === "dept_manager") {
    await cleanupOrphanedDepartments(admin, targetDepartmentIds);
  }
}

// 自分自身の表示名。役職に関係なく誰でも変更できる（削除やロール変更は
// オーナーのみだが、名前は本人が直接直すのが自然）。複数事業者を運営する
// オーナー（staff_org_links）は事業者ごとに別の表示名を持てるので、今
// どの事業者を見ているか（ctx.orgId）に応じて、profiles（本来の所属先）
// と staff_org_links（掛け持ち先）のどちらを直すべきか振り分ける。
export async function updateMyDisplayName(displayName: string) {
  const ctx = await requireContext();
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("表示名を入力してください");
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ display_name: trimmed }).eq("id", ctx.userId).eq("org_id", ctx.orgId).select("id");
  if (error) throw error;
  if (data && data.length > 0) return;

  // staff_org_links への書き込みはユーザーの書き込みポリシーを置いておらず
  // service_role専用（20260914000002_staff_multi_org.sqlのコメント参照）。
  const admin = createServiceRoleClient();
  const { error: linkError } = await admin.from("staff_org_links").update({ display_name: trimmed }).eq("user_id", ctx.userId).eq("org_id", ctx.orgId);
  if (linkError) throw linkError;
}
