"use server";

import { cookies } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import type { RefundMode, RefundStage } from "@/lib/supabase/types";

async function requireContext() {
  const ctx = await getStaffContext();
  if (!ctx) throw new Error("権限がありません");
  return ctx;
}

async function requireHq() {
  const ctx = await requireContext();
  if (!ctx.isHq) throw new Error("権限がありません");
  return ctx;
}

// org_write ポリシーは owner のみ更新可（reception は不可）。RLS は該当行が
// なければ黙って0件更新で終わるため、更新後に選択して件数で判定する。
export async function updateCompanyInfo(fields: {
  name: string;
  display_name: string;
  rep_name: string;
  address: string;
  tel: string;
  email: string;
}) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name: fields.name.trim(),
      display_name: fields.display_name.trim(),
      rep_name: fields.rep_name.trim() || null,
      address: fields.address.trim() || null,
      tel: fields.tel.trim() || null,
      email: fields.email.trim() || null,
    })
    .eq("id", ctx.orgId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("会社情報の変更はオーナーのみ行えます");
}

// solo=true が「1人運用（スタッフ機能を隠す）」。トグルのラベルは
// 「スタッフ連携を使う」＝solo の反転で見せる。
export async function updateStaffMode(enabled: boolean) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ solo: !enabled })
    .eq("id", ctx.orgId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("この切り替えはオーナーのみ行えます");
}

export async function createMenu(orgId: string) {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menus")
    .insert({ org_id: orgId, label: "新しいメニュー", price: 0, payout: 0, lead_hours: 24, sort: 999 })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data.id;
}

export async function updateMenu(
  id: string,
  fields: { label: string; note: string; price: number; lead_hours: number; active: boolean },
) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menus")
    .update({
      label: fields.label.trim(),
      note: fields.note.trim() || null,
      price: fields.price,
      lead_hours: fields.lead_hours,
      active: fields.active,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMenu(id: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("menus").delete().eq("id", id);
  if (error) throw error;
}

export async function addMenuQuestion(menuId: string, label: string, sort: number) {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_questions")
    .insert({ menu_id: menuId, label: label.trim() || "質問", sort })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data.id;
}

export async function updateMenuQuestion(id: string, label: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("menu_questions").update({ label: label.trim() }).eq("id", id);
  if (error) throw error;
}

export async function deleteMenuQuestion(id: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("menu_questions").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// ログイン情報（この管理画面に入るためのメール・パスワード。書類には使わない）
// ============================================================
export async function updateLoginEmail(newEmail: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) throw error;
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
export async function createIntakeForm(orgId: string, saveAnswers: boolean) {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intake_forms")
    .insert({ org_id: orgId, label: "新しいテンプレ", save_answers: saveAnswers, sort: 999 })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data.id;
}

export async function updateIntakeForm(id: string, fields: { label: string; note: string; save_answers: boolean }) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("intake_forms")
    .update({ label: fields.label.trim(), note: fields.note.trim() || null, save_answers: fields.save_answers })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteIntakeForm(id: string) {
  await requireContext();
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
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("intake_fields").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// キャンセル・返金ポリシー（段階は固定。返金の扱いと割合だけを設定する）
// ============================================================
export async function updateRefundPolicy(orgId: string, stage: RefundStage, mode: RefundMode, pct: number) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("refund_policies")
    .upsert({ org_id: orgId, stage, mode, pct: Math.max(0, Math.min(100, pct)) }, { onConflict: "org_id,stage" });
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
async function createOrgRow(fields: OrgFields, admin: ReturnType<typeof createServiceRoleClient>) {
  const slug = validateSlug(fields.slug);
  if (!fields.name.trim() || !fields.display_name.trim()) {
    throw new Error("正式名称・表示名は必須です");
  }

  const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (existing) throw new Error("このURLの合言葉はすでに使われています");

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: fields.name.trim(),
      display_name: fields.display_name.trim(),
      rep_name: fields.rep_name.trim() || null,
      tel: fields.tel.trim() || null,
      email: fields.email.trim() || null,
      slug,
      plan_status: "trial",
      trial_ends_on: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (orgErr || !org) throw orgErr ?? new Error("事業者を作成できませんでした");

  const defaults: { stage: RefundStage; mode: RefundMode; pct: number }[] = [
    { stage: "prequote", mode: "nocharge", pct: 0 },
    { stage: "accepted", mode: "full", pct: 100 },
    { stage: "started", mode: "partial", pct: 50 },
    { stage: "delivered", mode: "none", pct: 0 },
    { stage: "terminate", mode: "full", pct: 100 },
  ];
  await admin.from("refund_policies").insert(defaults.map((d) => ({ org_id: org.id, ...d })));

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

  let result: { orgId: string; slug: string };
  try {
    result = await createOrgRow(fields, admin);
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
export async function createOrgForCurrentUser(fields: OrgFields) {
  const ctx = await requireContext();
  if (ctx.role !== "owner") throw new Error("この操作はオーナーのみ行えます");

  const admin = createServiceRoleClient();
  const result = await createOrgRow(fields, admin);

  const { error } = await admin.from("staff_org_links").insert({
    user_id: ctx.userId,
    org_id: result.orgId,
    role: "owner",
    display_name: ctx.displayName,
  });
  if (error) {
    await admin.from("organizations").delete().eq("id", result.orgId);
    throw error;
  }

  return result;
}

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

// 「自分のログインで追加した窓口」をセルフサービスで削除する。今のログイン
// の本来の事業者（primary）は対象外（削除するとそのログイン自体が
// プロフィールを失って詰む）。staff_org_links 経由で追加した分だけ許可。
export async function removeMyOrgLink(orgId: string) {
  const ctx = await requireContext();
  const target = ctx.orgs.find((o) => o.orgId === orgId);
  if (!target || target.isPrimary || target.role !== "owner") {
    throw new Error("この窓口は削除できません");
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  if (error) throw error;

  await clearStaffOrgCookieIfCurrent(orgId);
}

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
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", ctx.userId)
    .select("id, kind, request_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("自分が送ったメッセージのみ削除できます");

  // 見積もりチャットを削除したら、まだ決済前（quoted）ならその見積もり自体も取り下げる
  // （決済済み・対応中のものは削除しても取り下げない）。
  const deleted = data[0];
  if (deleted.kind === "quote" && deleted.request_id) {
    const { data: declined } = await supabase
      .from("requests")
      .update({ phase: "declined" })
      .eq("id", deleted.request_id)
      .eq("phase", "quoted")
      .select("id");
    if (declined && declined.length > 0) {
      await postCaseNotice(supabase, deleted.request_id, "見積もりチャットが削除されたため取り下げました");
    }
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

export async function unarchiveThread(threadId: string) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("threads").update({ archived_at: null }).eq("id", threadId);
  if (error) throw error;
  await setCustomerActiveForThread(threadId, true);
}

// 依頼主を丸ごと完全削除する（一覧の「削除」用）。トーク・メッセージ・
// 添付・案件・評価・作業メモ・紹介record も customers への on delete
// cascade で連動して消える。アーカイブと違い元に戻せない。
export async function deleteCustomer(customerId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId).eq("org_id", ctx.orgId);
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
    items: { menuId: string | null; label: string; price: number; payout: number; qty: number }[];
    note: string;
    due: string;
    saveAsMenu?: boolean;
  },
) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const items = input.items.filter((it) => it.qty > 0 && it.label.trim());
  if (items.length === 0) throw new Error("見積もりの項目を1つ以上追加してください");

  const amount = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const title = items.length > 2 ? `${items[0].label}ほか${items.length - 1}件` : items.map((it) => it.label).join("・");

  if (input.saveAsMenu) {
    const customItems = items.filter((it) => !it.menuId);
    if (customItems.length > 0) {
      const { error: menuError } = await supabase
        .from("menus")
        .insert(customItems.map((it) => ({ org_id: ctx.orgId, label: it.label, price: it.price, payout: it.payout })));
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
    })
    .select("id")
    .single();
  if (reqError || !request) throw reqError ?? new Error("案件の作成に失敗しました");

  const { error: itemsError } = await supabase
    .from("request_items")
    .insert(items.map((it, i) => ({ request_id: request.id, menu_id: it.menuId, label: it.label, price: it.price, payout: it.payout, qty: it.qty, sort: i })));
  if (itemsError) throw itemsError;

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

  return request.id as string;
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

export async function startCaseRequest(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ phase: "started", started_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("phase", "preparing")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("着手できる状態ではありません");
  await postCaseNotice(supabase, requestId, "着手しました");
}

export async function confirmPayment(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("requests")
    .update({
      phase: "preparing",
      accepted_at: now,
      pay_method: "bank",
      pay_status: "paid",
      paid_at: now,
      paid_marked_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("phase", "quoted")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("入金確認できる状態ではありません");
  await postCaseNotice(supabase, requestId, "入金を確認しました");
}

export async function declineCaseRequest(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ phase: "declined" })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("phase", "quoted")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("取り下げできる状態ではありません（すでに決済済みの可能性があります）");
  await postCaseNotice(supabase, requestId, "見積もりを取り下げました");
}

export async function submitCaseReport(
  requestId: string,
  summary: string,
  noteToCustomer: string,
  deliverables: string,
  delivery: string,
) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = summary.trim();
  if (!trimmed) throw new Error("完了報告の内容を入力してください");

  const { data: request } = await supabase.from("requests").select("id, phase").eq("id", requestId).eq("org_id", ctx.orgId).maybeSingle();
  if (!request) throw new Error("案件が見つかりません");
  if (request.phase !== "started") throw new Error("着手中の案件のみ完了報告できます");

  const details = [
    ...(deliverables.trim() ? [{ label: "納品物", value: deliverables.trim() }] : []),
    ...(delivery.trim() ? [{ label: "受け渡し", value: delivery.trim() }] : []),
  ];

  const now = new Date().toISOString();
  const { error: reportError } = await supabase.from("completion_reports").insert({
    request_id: requestId,
    summary: trimmed,
    details,
    note_to_customer: noteToCustomer.trim() || null,
    submitted_at: now,
    sent_at: now,
  });
  if (reportError) throw reportError;

  const { error: reqError } = await supabase.from("requests").update({ phase: "completed", completed_at: now }).eq("id", requestId).eq("org_id", ctx.orgId);
  if (reqError) throw reqError;
  await postCaseNotice(supabase, requestId, "完了報告を送信しました");
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

// 項目付きテンプレ（intake_forms）を依頼主トークに intake_request として送る。
// 依頼主側は回答すると customer_answers に保存され、次回以降は自動で
// 引き当てられる（すでに全項目回答済みなら依頼主側は入力フォームの代わりに
// 回答済み表示になる）。
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
