"use server";

import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import { isCustomerCaughtUp, notifyCustomerCompletionReport, notifyCustomerNewMessage, notifyCustomerQuoteCreated } from "@/lib/notify";
import type { StaffRole, SubscriptionCadence } from "@/lib/supabase/types";
import { advanceFee, ADVANCE_FEE_RATE, ADVANCE_VALID_MINUTES } from "@/lib/advance";
import { TASK_EXAMPLES } from "@/lib/task-examples";
import { dueDateEndISO, dueDateLabel, isDueDate, jstTodayDate } from "@/lib/due-date";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 本番の Next.js は Server Action で throw されたエラー文を画面に渡さない
// （汎用の文言に置き換わる）。「何が悪かったか」を伝えたい操作はこれで包み、
// 日本語の文言だけを戻り値で返す。想定外のエラーはログに残して空文字にする
// （呼び出し側は unwrap() で例外に戻し、errorMessage の既定の文言を出す）。
async function toResult<T>(label: string, fn: () => Promise<T>): Promise<{ error: string | null; data: T | null }> {
  try {
    return { error: null, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "";
    if (/[ぁ-んァ-ヶ一-龠]/.test(msg)) return { error: msg, data: null };
    console.error(label, e);
    return { error: "", data: null };
  }
}

async function requireContext() {
  const ctx = await getStaffContext();
  if (!ctx) throw new Error("権限がありません");
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

async function requireContextWithDelete() {
  const ctx = await requireContext();
  requireDeletePermission(ctx);
  return ctx;
}

// org_write ポリシーは owner のみ更新可（reception は不可）。RLS は該当行が
// なければ黙って0件更新で終わるため、更新後に選択して件数で判定する。
// 依頼主に見える事業者名はこれだけ（正式名称・代表者名・住所・電話番号は
// どこにも表示に使っていないため、編集画面ごと廃止した）。
export async function updateOrgDisplayName(...args: Parameters<typeof updateOrgDisplayNameInner>) {
  return toResult("updateOrgDisplayName", () => updateOrgDisplayNameInner(...args));
}

async function updateOrgDisplayNameInner(displayName: string) {
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

// 「頼めること」一覧（100件）から受付メニューをまとめて作る。同じ名前の
// メニューがすでにあれば作らない。金額は空欄（＝相談のみ・見積もりの候補には
// まだ出ない）で作り、金額と目安時間は本部があとから手で入れる。
export async function importTaskExampleMenus(orgId: string) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { data: existing, error: exError } = await supabase.from("menus").select("label").eq("org_id", orgId);
  if (exError) throw exError;
  const have = new Set((existing ?? []).map((m) => m.label.trim()));
  const labels = TASK_EXAMPLES.flatMap((g) => g.items).filter((label) => !have.has(label));
  if (labels.length === 0) return [];
  const { data, error } = await supabase
    .from("menus")
    .insert(labels.map((label, i) => ({ org_id: orgId, label, price: null, payout: 0, lead_hours: 24, sort: 1000 + i })))
    .select("id, org_id, label, note, icon, price, lead_hours, active, department_id");
  if (error) throw error;
  return data ?? [];
}

export async function updateMenu(
  id: string,
  fields: { label: string; note: string; price: number | null; active: boolean; icon: string | null },
) {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menus")
    .update({
      label: fields.label.trim(),
      note: fields.note.trim() || null,
      price: fields.price,
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
export async function updateLoginEmail(...args: Parameters<typeof updateLoginEmailInner>) {
  return toResult("updateLoginEmail", () => updateLoginEmailInner(...args));
}

async function updateLoginEmailInner(newEmail: string) {
  await requireContext();
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  // リダイレクト先を指定しないと、プロジェクト共通の既定（依頼主用アプリの
  // ドメイン）に飛んでしまう。スタッフ用アプリ自身の確認ページに戻す。
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: `${protocol}://${host}/auth/confirm` });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      throw new Error("このメールアドレスは既に登録されています。");
    }
    throw error;
  }
}

// パスワードを忘れたログイン前の人向け（↔ updateLoginPassword はログイン済み・
// 現在のパスワードを知っている人向け）。メールが存在するかどうかはSupabase側が
// 意図的に教えてくれない仕様なので、成功・失敗に関わらず同じ案内文にする。
export async function requestPasswordReset(...args: Parameters<typeof requestPasswordResetInner>) {
  return toResult("requestPasswordReset", () => requestPasswordResetInner(...args));
}

async function requestPasswordResetInner(email: string) {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("メールアドレスをご入力ください");
  const supabase = await createClient();
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: `${protocol}://${host}/auth/confirm` });
}

// /auth/confirm 経由でrecoveryトークンを確認した直後（まだ仮のセッションの
// 状態）に呼ぶ。新しいパスワードを設定して、本来のログインを完了させる。
export async function completePasswordReset(...args: Parameters<typeof completePasswordResetInner>) {
  return toResult("completePasswordReset", () => completePasswordResetInner(...args));
}

async function completePasswordResetInner(newPassword: string) {
  if (newPassword.length < 8) throw new Error("パスワードは8文字以上にしてください");
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("セッションの有効期限が切れました。もう一度パスワード再設定をお試しください。");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateLoginPassword(...args: Parameters<typeof updateLoginPasswordInner>) {
  return toResult("updateLoginPassword", () => updateLoginPasswordInner(...args));
}

async function updateLoginPasswordInner(currentPassword: string, newPassword: string) {
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
const NEW_TEMPLATE_LABEL = "新しいテンプレ";

export async function createIntakeForm(orgId: string) {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intake_forms")
    .insert({ org_id: orgId, label: NEW_TEMPLATE_LABEL, sort: 999 })
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

// 返信テンプレは事業所全体で共有するものなので、削除できるのは本部（オーナー）だけ。
// 秘書（マネージャー・受付）が誤って消して他の人が困らないようにする。
export async function deleteIntakeForm(id: string) {
  const ctx = await requireContextWithDelete();
  if (ctx.role !== "owner" && ctx.role !== "reception") throw new Error("返信テンプレの削除は本部のみ行えます");
  const supabase = await createClient();
  const { error } = await supabase.from("intake_forms").delete().eq("id", id);
  if (error) throw error;
}

// 「新しいテンプレを作る」を押したまま何も入力されなかったテンプレを片付ける。
// 中身が空のときだけ消すので、削除権限のない秘書が呼んでもよい。
export async function discardIntakeFormIfEmpty(id: string) {
  await requireContext();
  const supabase = await createClient();
  const { data } = await supabase.from("intake_forms").select("label, note, intake_fields(label)").eq("id", id).maybeSingle();
  if (!data) return false;
  const label = (data.label ?? "").trim();
  const empty =
    (label === "" || label === NEW_TEMPLATE_LABEL) &&
    !(data.note ?? "").trim() &&
    (data.intake_fields ?? []).every((f: { label: string | null }) => !(f.label ?? "").trim());
  if (!empty) return false;
  const { error } = await supabase.from("intake_forms").delete().eq("id", id);
  if (error) throw error;
  return true;
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

// 依頼主アプリのページ名。問い合わせ窓口の合言葉には使えない（src/proxy.ts と合わせる）。
const RESERVED_SLUGS = new Set(["auth", "terms", "api"]);

function validateSlug(rawSlug: string) {
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || RESERVED_SLUGS.has(slug)) {
    throw new Error("URLの合言葉は半角英数字とハイフンのみ・2〜40文字で入力してください");
  }
  return slug;
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
  const admin = createServiceRoleClient();
  const shouldNotify = await isCustomerCaughtUp(admin, threadId);
  const { error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: ctx.userId, sender_role: ctx.role, kind: "text", body: trimmed });
  if (error) throw error;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
  if (shouldNotify) await notifyCustomerNewMessage(admin, threadId);
}

// 依頼主トークへの画像・PDFの送信。ファイル本体はクライアント側で Storage に
// アップロード済み（パスは `<threadId>/...`）で、ここではメッセージと添付レコードを作るだけ。
export async function sendStaffFiles(threadId: string, attachments: { path: string; name: string; mime: string; bytes: number }[]) {
  const ctx = await requireContext();
  if (attachments.length === 0) return;
  if (attachments.some((a) => !a.path.startsWith(`${threadId}/`))) throw new Error("添付ファイルの保存先が正しくありません");
  const supabase = await createClient();
  const admin = createServiceRoleClient();
  const shouldNotify = await isCustomerCaughtUp(admin, threadId);
  const { data: filesMsg, error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: ctx.userId, sender_role: ctx.role, kind: "files" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: attError } = await supabase.from("message_attachments").insert(
    attachments.map((a) => ({ message_id: filesMsg.id, file_path: a.path, file_name: a.name, mime: a.mime, bytes: a.bytes })),
  );
  if (attError) throw attError;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
  if (shouldNotify) await notifyCustomerNewMessage(admin, threadId);
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
// 支払い済み（着手前〜完了）の案件は消さない。消すと依頼主の残高は引かれたまま
// 案件と支払いの記録だけが消えてしまうため。表示を消したいときは非表示にする。
const PAID_PHASES = ["preparing", "started", "completed"];
const PAID_DELETE_ERROR = "支払い済みの案件は削除できません。表示を消したいときは「非表示にする」を使ってください。";

async function assertRequestDeletable(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string) {
  const { data } = await supabase.from("requests").select("phase").eq("id", requestId).maybeSingle();
  if (data && PAID_PHASES.includes(data.phase)) throw new Error(PAID_DELETE_ERROR);
}

export async function deleteMessage(...args: Parameters<typeof deleteMessageInner>) {
  return toResult("deleteMessage", () => deleteMessageInner(...args));
}

async function deleteMessageInner(messageId: string) {
  const ctx = await requireContextWithDelete();
  const supabase = await createClient();
  const { data: target } = await supabase.from("messages").select("kind, request_id").eq("id", messageId).maybeSingle();
  if (target?.kind === "quote" && target.request_id) await assertRequestDeletable(supabase, target.request_id);
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", ctx.userId)
    .select("id, kind, request_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("自分が送ったメッセージのみ削除できます");

  // 見積もりチャットを削除したら、その見積もり自体も完全に削除する
  // （request_items・案件トーク・そのメッセージまでDBのon delete cascadeで一緒に消える）。
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
export async function reassignThreadDepartment(...args: Parameters<typeof reassignThreadDepartmentInner>) {
  return toResult("reassignThreadDepartment", () => reassignThreadDepartmentInner(...args));
}

async function reassignThreadDepartmentInner(threadId: string, departmentId: string | null) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("threads")
    .update({ department_id: departmentId })
    .eq("id", threadId)
    .eq("org_id", ctx.orgId)
    .eq("kind", "customer")
    .select("id");
  if (error) throw error;
  // RLS で弾かれると0件のまま黙って終わるので、変わらなかったことを伝える。
  if (!data?.length) throw new Error("担当を変えられませんでした。この依頼主を担当していない可能性があります。");
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
export async function deleteCaseRequest(...args: Parameters<typeof deleteCaseRequestInner>) {
  return toResult("deleteCaseRequest", () => deleteCaseRequestInner(...args));
}

async function deleteCaseRequestInner(requestId: string) {
  const ctx = await requireContextWithDelete();
  const supabase = await createClient();
  await assertRequestDeletable(supabase, requestId);
  const { error } = await supabase.from("requests").delete().eq("id", requestId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

// ============================================================
// 案件（見積もり〜完了報告）。制作者への割り当ては次のフェーズで対応する
// ため、今は受付が代わりに着手・完了報告まで進める。
// ============================================================

export async function createCaseRequest(...args: Parameters<typeof createCaseRequestInner>) {
  return toResult("createCaseRequest", () => createCaseRequestInner(...args));
}

async function createCaseRequestInner(
  customerThreadId: string,
  customerId: string,
  input: {
    items: { menuId: string | null; label: string; price: number; payout: number; qty: number }[];
    note: string;
    // 日本時間 YYYY-MM-DD。単発では完了予定日（チャットで依頼主と決めた日）、
    // 定期では支払い期限（この日までに確定してもらう）。立替では使わない。
    dueDate?: string;
    saveAsMenu?: boolean;
    // メニューに無い依頼を時間精算にする場合。設定すると items は無視する。
    hourly?: { rate: number; cap: number; label: string };
    // 立替（実費の支払い代行）にする場合。実費と手数料の2行の見積もりになり、
    // minutes 分を過ぎると依頼主は承諾できない（DBのトリガーでも拒否する）。
    advance?: { label: string; amount: number; minutes: number };
    // 定期対応（毎週・毎月）にする場合。hourly とは併用不可。初回の支払いが
    // 確定するまでは定期対応としては動き出さない
    // （pay_request_from_balance 側で有効化する）。
    cadence?: SubscriptionCadence;
    // 毎週の作業曜日（任意・複数可）。選んだ数だけ1回分の項目を週に数え、
    // 引き落としは日曜はじまりで数えた最初の作業日の前日に週1回まとめて行う。
    // 毎月は日付を指定せず、引き落とした日の1か月後に次を引き落とす。
    workWeekdays?: number[];
  },
) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const isHourly = !!input.hourly;
  const advance = input.advance;
  if (advance && (!advance.label.trim() || !(advance.amount > 0))) throw new Error("代金の内容と実費を入力してください");
  if (advance && !(ADVANCE_VALID_MINUTES as readonly number[]).includes(advance.minutes)) throw new Error("有効時間を選んでください");
  const advanceFeeAmount = advance ? advanceFee(Math.round(advance.amount)) : 0;
  let items = isHourly
    ? []
    : advance
      ? [
          { menuId: null, label: `実費（${advance.label.trim()}）`, price: Math.round(advance.amount), payout: 0, qty: 1 },
          { menuId: null, label: `立替手数料（${Math.round(ADVANCE_FEE_RATE * 100)}%）`, price: advanceFeeAmount, payout: 0, qty: 1 },
        ]
      : input.items.filter((it) => it.qty > 0 && it.label.trim());
  if (!isHourly && items.length === 0) throw new Error("見積もりの項目を1つ以上追加してください");
  if (isHourly && (!input.hourly!.rate || !input.hourly!.cap)) throw new Error("時間単価と上限額を入力してください");
  // DB の制約で途中で落ちると、作りかけの案件だけが残ってしまうので先に確かめる。
  const isWholeYen = (n: number) => Number.isInteger(n) && n >= 0;
  if (items.some((it) => !isWholeYen(it.price) || !isWholeYen(it.payout) || !Number.isInteger(it.qty) || it.qty < 1)) throw new Error("金額と数量は整数で入力してください");
  if (isHourly && (!isWholeYen(input.hourly!.rate) || !isWholeYen(input.hourly!.cap))) throw new Error("金額は整数で入力してください");
  const workWeekdays = input.cadence === "weekly" && !advance ? [...new Set(input.workWeekdays ?? [])].sort((a, b) => a - b) : [];
  if (workWeekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("曜日を選び直してください");
  if (workWeekdays.length > 1) items = items.map((it) => ({ ...it, qty: it.qty * workWeekdays.length }));
  const anchorWeekday = workWeekdays.length > 0 ? (workWeekdays[0] + 6) % 7 : null;
  const isRecurring = !advance && !!input.cadence;
  const dateLabel = isRecurring ? "支払い期限" : "完了予定日";
  const dueDate = advance ? "" : (input.dueDate ?? "").trim();
  if (!advance && !isDueDate(dueDate)) throw new Error(`${dateLabel}を選んでください`);
  if (!advance && dueDate < jstTodayDate()) throw new Error(`${dateLabel}は今日以降の日付を選んでください`);

  const amount = isHourly ? input.hourly!.cap : items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const baseTitle = isHourly
    ? input.hourly!.label.trim() || "時間精算の依頼"
    : advance
      ? `立替：${advance.label.trim()}`
      : items.length > 2
      ? `${items[0].label}ほか${items.length - 1}件`
      : items.map((it) => it.label).join("・");
  const title = workWeekdays.length > 0 ? `${baseTitle}（毎週${workWeekdays.map((d) => WEEKDAY_LABELS[d]).join("・")}）` : baseTitle;

  if (!isHourly && !advance && input.saveAsMenu) {
    const customItems = items.filter((it) => !it.menuId);
    if (customItems.length > 0) {
      const { error: menuError } = await supabase
        .from("menus")
        .insert(customItems.map((it) => ({ org_id: ctx.orgId, label: it.label, price: it.price, payout: it.payout, lead_hours: 24 })));
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
      due_at: dueDate && !isRecurring ? dueDateEndISO(dueDate) : null,
      payment_timing: "balance",
      hourly_rate: isHourly ? input.hourly!.rate : null,
      hourly_cap: isHourly ? input.hourly!.cap : null,
      cadence: advance ? null : (input.cadence ?? null),
      advance_amount: advance ? Math.round(advance.amount) : null,
      quote_expires_at: advance ? new Date(Date.now() + advance.minutes * 60 * 1000).toISOString() : isRecurring ? dueDateEndISO(dueDate) : null,
    })
    .select("id")
    .single();
  if (reqError || !request) throw reqError ?? new Error("案件の作成に失敗しました");

  // sender_id=null（システム発）の行は messages_send の RLS (sender_id = auth.uid()) を
  // 通らないため、通知メッセージだけは service-role で書く。
  const admin = createServiceRoleClient();
  try {
    if (!isHourly) {
      const { error: itemsError } = await supabase
        .from("request_items")
        .insert(items.map((it, i) => ({ request_id: request.id, menu_id: it.menuId, label: it.label, price: it.price, payout: it.payout, qty: it.qty, sort: i })));
      if (itemsError) throw itemsError;
    }

    // 定期対応の雛形を作っておく。初回の支払いが確定するまでは active=false
    // のままで、pay_request_from_balance が確定と同時に有効化する。
    if (input.cadence && !advance) {
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
          anchor_weekday: input.cadence === "weekly" ? anchorWeekday : null,
          anchor_day_of_month: null,
          anchor_last_day_of_month: false,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (subError || !subscription) throw subError ?? new Error("定期対応の作成に失敗しました");
      await supabase.from("requests").update({ subscription_id: subscription.id }).eq("id", request.id);
    }

    const payload: Record<string, unknown> = { title, note: input.note.trim() || undefined, due: dueDate && !isRecurring ? dueDateLabel(dueDate) : undefined, dueDate: dueDate && !isRecurring ? dueDate : undefined, payDeadline: isRecurring ? dueDateLabel(dueDate) : undefined };
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

    await admin.from("messages").insert({
      thread_id: caseThread.id,
      sender_id: null,
      sender_role: null,
      kind: "notice",
      // 案件トークは秘書・スタッフも見るので金額は書かない（金額は本部だけが見る）。
      body: "見積もりを送信しました",
    });
  } catch (e) {
    // 途中で失敗したら作りかけの案件を消す（明細・見積もりカード・案件トークも on delete cascade で消える）。
    await admin.from("requests").delete().eq("id", request.id);
    throw e;
  }

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
export async function startCaseRequest(...args: Parameters<typeof startCaseRequestInner>) {
  return toResult("startCaseRequest", () => startCaseRequestInner(...args));
}

async function startCaseRequestInner(requestId: string) {
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
  // 期限は見積もりで決めた完了予定日（due_at）のまま。完了予定日を決める前に
  // 作った古い見積もりだけ、着手した瞬間から作業時間の目安で期限を出す。
  const update: { phase: "started"; started_at: string; due_at?: string } = { phase: "started", started_at: now };
  if (current.lead_hours != null) update.due_at = new Date(Date.now() + current.lead_hours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("requests")
    .update(update)
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
export async function submitCaseReport(...args: Parameters<typeof submitCaseReportInner>) {
  return toResult("submitCaseReport", () => submitCaseReportInner(...args));
}

async function submitCaseReportInner(
  requestId: string,
  summary: string,
  details: { label: string; value: string }[],
  attachments: { path: string; name: string; mime: string | null; bytes: number | null; label?: string }[],
) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const trimmed = summary.trim();
  if (!trimmed) throw new Error("完了報告の内容を入力してください");

  const { data: request } = await supabase.from("requests").select("id, phase, customer_id").eq("id", requestId).eq("org_id", ctx.orgId).maybeSingle();
  if (!request) throw new Error("案件が見つかりません");
  if (request.phase !== "started") throw new Error("着手中の案件のみ完了報告できます");

  const cleanDetails = details.filter((d) => d.label.trim() && d.value.trim()).map((d) => ({ label: d.label.trim(), value: d.value.trim() }));

  // 確認待ちの報告があるのに出し直すと、報告も添付も二重になる。
  const { data: pending } = await supabase.from("completion_reports").select("id").eq("request_id", requestId).is("sent_at", null).limit(1);
  if (pending?.length) throw new Error("確認待ちの完了報告があります。秘書・本部の確認をお待ちください。");

  if (attachments.length > 0) {
    const { error: attError } = await supabase.from("completion_report_attachments").insert(
      attachments.map((a) => ({ request_id: requestId, file_path: a.path, file_name: a.name, mime: a.mime, bytes: a.bytes, label: a.label ?? null })),
    );
    if (attError) throw attError;
  }

  const canSendDirectly = ctx.role === "owner" || ctx.role === "dept_manager";
  const now = new Date().toISOString();
  const { error: reportError } = await supabase.from("completion_reports").insert({
    request_id: requestId,
    creator_id: ctx.userId,
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
  await finalizeHourlyBilling(supabase, requestId);
  await postCaseNotice(supabase, requestId, "完了報告を送信しました");
  await notifyCustomerCompletionReport(createServiceRoleClient(), ctx.orgId, request.customer_id);
}

// 時間精算の最終金額を確定し、上限額との差額を残高に戻す。失敗しても完了報告は
// 送れているので止めはしないが、気付けるよう案件トークに残す。
async function finalizeHourlyBilling(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string) {
  const { error } = await supabase.rpc("finalize_hourly_billing", { p_request_id: requestId });
  if (error) {
    console.error("finalize_hourly_billing failed", { requestId, error });
    await postCaseNotice(supabase, requestId, "時間精算の差額を残高に戻せませんでした。本部で確認してください");
  }
}

// スタッフが提出した完了報告（下書き）を、マネージャー・オーナーが確認して
// 依頼主に送る。
export async function approveCaseReport(...args: Parameters<typeof approveCaseReportInner>) {
  return toResult("approveCaseReport", () => approveCaseReportInner(...args));
}

async function approveCaseReportInner(requestId: string) {
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
  await finalizeHourlyBilling(supabase, requestId);
  await postCaseNotice(supabase, requestId, "完了報告を確認し、依頼主に送信しました");
  await notifyCustomerCompletionReport(createServiceRoleClient(), ctx.orgId, request.customer_id);
}

// 見積もり段階（まだ入金前）の見送り。費用が発生していないので即確定でよい。
export async function declineQuote(...args: Parameters<typeof declineQuoteInner>) {
  return toResult("declineQuote", () => declineQuoteInner(...args));
}

async function declineQuoteInner(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: r, error: fetchError } = await supabase.from("requests").select("phase").eq("id", requestId).eq("org_id", ctx.orgId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!r) throw new Error("案件が見つかりません");
  if (r.phase !== "quoted") throw new Error("この操作は見積もり段階のみ行えます");

  const now = new Date().toISOString();
  // 依頼主の支払いと同時になったときに、支払い済みを見送りで上書きしない。
  const { data: declined, error } = await supabase.from("requests").update({ phase: "declined", cancelled_at: now }).eq("id", requestId).eq("org_id", ctx.orgId).eq("phase", "quoted").select("id");
  if (error) throw error;
  if (!declined?.length) throw new Error("この操作は見積もり段階のみ行えます");
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

  const admin = createServiceRoleClient();
  const shouldNotify = await isCustomerCaughtUp(admin, threadId);
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: ctx.userId,
    sender_role: ctx.role,
    kind: "intake_request",
    payload: { formLabel: form.label, note: form.note ?? undefined, fields },
  });
  if (error) throw error;
  await supabase.from("threads").update({ last_msg_at: new Date().toISOString() }).eq("id", threadId);
  if (shouldNotify) await notifyCustomerNewMessage(admin, threadId);
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
// 1人につき1つ自動でできるもの（「秘書：（表示名）」）。すでにマネージャー
// だった人（表示名の変更など、昇格を伴わない保存）はそのまま自分の窓口を
// 使う。新たに昇格する人は、スタッフ（dept_leader）として他の窓口の
// 手伝いに割り当てられていた分（staff_departments）があってもそれとは
// 無関係に、必ず新しい自分の窓口を作る（既存の誰かの窓口を誤って
// 乗っ取ってしまわないように）。
async function ensureManagerDepartment(admin: ReturnType<typeof createServiceRoleClient>, orgId: string, profileId: string, alias: string, wasAlreadyManager: boolean) {
  if (wasAlreadyManager) {
    const existing = await departmentIdsOf(admin, profileId);
    if (existing.length > 0) return existing;
  }
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
    .select("role, used_at, created_at, organizations(display_name)")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return null;
  const org = Array.isArray(invite.organizations) ? invite.organizations[0] : invite.organizations;
  return { role: invite.role as StaffRole, valid: !invite.used_at && !isInviteExpired(invite.created_at), orgDisplayName: org?.display_name ?? "" };
}

// 招待リンクは発行から7日で使えなくする（URLが残り続けて誰でも参加できないように）。
const INVITE_VALID_DAYS = 7;
function isInviteExpired(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() > INVITE_VALID_DAYS * 24 * 60 * 60 * 1000;
}

export async function acceptStaffInvite(...args: Parameters<typeof acceptStaffInviteInner>) {
  return toResult("acceptStaffInvite", () => acceptStaffInviteInner(...args));
}

async function acceptStaffInviteInner(inviteId: string, fields: { email: string; password: string; displayName: string }) {
  if (fields.password.length < 8) throw new Error("パスワードは8文字以上にしてください");
  if (!fields.email.trim()) throw new Error("メールアドレスは必須です");

  const admin = createServiceRoleClient();
  const { data: invite } = await admin
    .from("staff_invites")
    .select("id, org_id, role, department_ids, used_at, created_at")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) throw new Error("この招待リンクは無効です");
  if (invite.used_at) throw new Error("この招待リンクはすでに使われています");
  if (isInviteExpired(invite.created_at)) throw new Error("この招待リンクは有効期限（7日）が切れています。新しいリンクを発行してもらってください");
  // 同じリンクで同時に2人が登録しないよう、先に「使用済み」にしておく（失敗したら戻す）。
  const { data: claimed } = await admin.from("staff_invites").update({ used_at: new Date().toISOString() }).eq("id", inviteId).is("used_at", null).select("id");
  if (!claimed?.length) throw new Error("この招待リンクはすでに使われています");
  const releaseInvite = () => admin.from("staff_invites").update({ used_at: null }).eq("id", inviteId);

  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email: fields.email.trim(),
    password: fields.password,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    await releaseInvite();
    throw new Error(userErr?.message.includes("already been registered") ? "このメールアドレスはすでに使われています" : "アカウントを作成できませんでした");
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userRes.user.id,
    org_id: invite.org_id,
    role: invite.role,
    display_name: fields.displayName.trim() || fields.email.trim(),
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userRes.user.id);
    await releaseInvite();
    throw profileErr;
  }

  if (invite.department_ids.length > 0) {
    await admin.from("staff_departments").insert(invite.department_ids.map((department_id: string) => ({ profile_id: userRes.user.id, department_id })));
  }
  await admin.from("staff_invites").update({ used_by: userRes.user.id }).eq("id", inviteId);

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
export async function updateStaffMember(...args: Parameters<typeof updateStaffMemberInner>) {
  return toResult("updateStaffMember", () => updateStaffMemberInner(...args));
}

async function updateStaffMemberInner(profileId: string, role: StaffRole, departmentIds: string[], alias: string) {
  const ctx = await requireManagerOrAbove();
  if (role !== "dept_leader" && ctx.role !== "owner") throw new Error("この役職には変更できません");
  const trimmedAlias = alias.trim();
  if (!trimmedAlias) throw new Error("表示名を入力してください");
  const admin = createServiceRoleClient();

  const { data: targetBefore } = await admin.from("profiles").select("role").eq("id", profileId).eq("org_id", ctx.orgId).maybeSingle();
  if (!targetBefore) throw new Error("このスタッフは見つかりませんでした");
  const previousRole = targetBefore?.role as StaffRole | undefined;
  // 本部（オーナー）が1人もいなくなると、誰も設定を変えられなくなる。
  if (previousRole === "owner" && role !== "owner") {
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).eq("role", "owner");
    if ((count ?? 0) <= 1) throw new Error("本部メンバーが1人もいなくなるため、この役職には変更できません");
  }
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
    resolvedDepartmentIds = await ensureManagerDepartment(admin, ctx.orgId, profileId, trimmedAlias, previousRole === "dept_manager");
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

export async function removeStaffMember(...args: Parameters<typeof removeStaffMemberInner>) {
  return toResult("removeStaffMember", () => removeStaffMemberInner(...args));
}

async function removeStaffMemberInner(profileId: string) {
  const ctx = await requireManagerOrAbove();
  if (profileId === ctx.userId) throw new Error("自分自身は削除できません");
  const admin = createServiceRoleClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", profileId).eq("org_id", ctx.orgId).maybeSingle();
  // 自分の事務所の人でなければ、ログインごと消してしまわないよう止める。
  if (!target) throw new Error("このスタッフは見つかりませんでした");
  if (target.role === "owner" && ctx.role !== "owner") throw new Error("この操作は本部のみ行えます");
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
export async function updateMyDisplayName(...args: Parameters<typeof updateMyDisplayNameInner>) {
  return toResult("updateMyDisplayName", () => updateMyDisplayNameInner(...args));
}

async function updateMyDisplayNameInner(displayName: string) {
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

// プロフィール画像は「この人自身の顔写真」なので、表示名と違って事業者ごとに
// 分ける必要はない（profiles.avatar_url 一本で良い）。
export async function updateMyAvatar(url: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", ctx.userId);
  if (error) throw error;
}

export async function removeMyAvatar() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", ctx.userId);
  if (error) throw error;
}

// ============================================================
// 問い合わせ窓口（TeeRA など、中央秘書が一時的に引き受けるお問い合わせの入口）。
// 名前だけで作れて、URL（/teera）は自動でできる。窓口ごとに担当秘書を決めると、
// その窓口から来たトークはその秘書の担当になる（未設定なら本部）。
// 止めるときは受付をオフにするだけ（削除はしない）。本部のみ。
// ============================================================
export type InquiryDesk = { id: string; name: string; slug: string; active: boolean; department_id: string | null; created_at: string };

export async function createInquiryDesk(...args: Parameters<typeof createInquiryDeskInner>) {
  return toResult("createInquiryDesk", () => createInquiryDeskInner(...args));
}

async function createInquiryDeskInner(name: string): Promise<InquiryDesk> {
  const ctx = await requireHqPrivileged();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("窓口の名前を入力してください");
  if (trimmed.length > 40) throw new Error("窓口の名前は40文字以内で入力してください");
  const admin = createServiceRoleClient();

  const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  let slug = "";
  for (let i = 0; i < 20; i++) {
    const candidate = base.length >= 2 ? (i === 0 ? base : `${base}-${i + 1}`) : `desk-${Math.random().toString(36).slice(2, 7)}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const [{ data: org }, { data: desk }] = await Promise.all([
      admin.from("organizations").select("id").eq("slug", candidate).maybeSingle(),
      admin.from("inquiry_desks").select("id").eq("slug", candidate).maybeSingle(),
    ]);
    if (!org && !desk) {
      slug = candidate;
      break;
    }
  }
  if (!slug) throw new Error("URLを決められませんでした。別の名前でお試しください");

  const { data, error } = await admin
    .from("inquiry_desks")
    .insert({ org_id: ctx.orgId, name: trimmed, slug })
    .select("id, name, slug, active, department_id, created_at")
    .single();
  if (error || !data) throw error ?? new Error("作成できませんでした");
  return data;
}

export async function setInquiryDeskActive(deskId: string, active: boolean) {
  const ctx = await requireHqPrivileged();
  const admin = createServiceRoleClient();
  const { error } = await admin.from("inquiry_desks").update({ active }).eq("id", deskId).eq("org_id", ctx.orgId);
  if (error) throw error;
}

// 窓口のURL（/teera の部分）をあとから変える。前のURLは使えなくなる。
export async function updateInquiryDeskSlug(...args: Parameters<typeof updateInquiryDeskSlugInner>) {
  return toResult("updateInquiryDeskSlug", () => updateInquiryDeskSlugInner(...args));
}

async function updateInquiryDeskSlugInner(deskId: string, rawSlug: string): Promise<string> {
  const ctx = await requireHqPrivileged();
  const slug = validateSlug(rawSlug);
  const admin = createServiceRoleClient();
  const [{ data: org }, { data: desk }] = await Promise.all([
    admin.from("organizations").select("id").eq("slug", slug).maybeSingle(),
    admin.from("inquiry_desks").select("id").eq("slug", slug).neq("id", deskId).maybeSingle(),
  ]);
  if (org || desk) throw new Error("このURLはすでに使われています");
  const { error } = await admin.from("inquiry_desks").update({ slug }).eq("id", deskId).eq("org_id", ctx.orgId);
  if (error) throw error;
  return slug;
}

// 窓口の担当秘書を決める・替える（departmentId は秘書の窓口。null なら本部）。
// 前の担当のままになっているこの窓口のトークも、新しい担当に移す
// （トークごとに別の秘書へ振った分はそのまま）。
export async function setInquiryDeskSecretary(deskId: string, departmentId: string | null) {
  const ctx = await requireHqPrivileged();
  const admin = createServiceRoleClient();
  const { data: desk } = await admin.from("inquiry_desks").select("department_id").eq("id", deskId).eq("org_id", ctx.orgId).maybeSingle();
  if (!desk) throw new Error("窓口が見つかりません");
  if (departmentId) {
    const { data: dept } = await admin.from("departments").select("id").eq("id", departmentId).eq("org_id", ctx.orgId).maybeSingle();
    if (!dept) throw new Error("担当秘書が見つかりません");
  }
  const { error } = await admin.from("inquiry_desks").update({ department_id: departmentId }).eq("id", deskId);
  if (error) throw error;
  let move = admin.from("threads").update({ department_id: departmentId }).eq("desk_id", deskId).eq("kind", "customer");
  move = desk.department_id ? move.eq("department_id", desk.department_id) : move.is("department_id", null);
  const { error: moveErr } = await move;
  if (moveErr) throw moveErr;
}

// ---------- 紹介元（紹介カード）----------
// 紹介カードを受け取った社長がトークで「〇〇の紹介です」と伝えたら、依頼主の
// 画面で紹介元を選んで 5,000円分の紹介特典を残高に付ける（DB関数 grant_referral_credit）。

export type ReferralSource = { id: string; name: string; active: boolean };

export async function createReferralSource(...args: Parameters<typeof createReferralSourceInner>) {
  return toResult("createReferralSource", () => createReferralSourceInner(...args));
}

async function createReferralSourceInner(name: string): Promise<ReferralSource> {
  const ctx = await requireHqPrivileged();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("紹介元の名前を入力してください");
  if (trimmed.length > 40) throw new Error("紹介元の名前は40文字以内で入力してください");
  const supabase = await createClient();
  const { data, error } = await supabase.from("referral_sources").insert({ org_id: ctx.orgId, name: trimmed }).select("id, name, active").single();
  if (error || !data) throw error ?? new Error("紹介元を追加できませんでした");
  return data;
}

export async function updateReferralSource(...args: Parameters<typeof updateReferralSourceInner>) {
  return toResult("updateReferralSource", () => updateReferralSourceInner(...args));
}

// 一度使った紹介元も記録を残すため、削除ではなく非表示（active=false）にする。
async function updateReferralSourceInner(id: string, fields: { name?: string; active?: boolean }) {
  const ctx = await requireHqPrivileged();
  const patch: { name?: string; active?: boolean } = {};
  if (fields.name !== undefined) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("紹介元の名前を入力してください");
    if (trimmed.length > 40) throw new Error("紹介元の名前は40文字以内で入力してください");
    patch.name = trimmed;
  }
  if (fields.active !== undefined) patch.active = fields.active;
  const supabase = await createClient();
  const { error } = await supabase.from("referral_sources").update(patch).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw error;
}

export async function grantReferralCredit(...args: Parameters<typeof grantReferralCreditInner>) {
  return toResult("grantReferralCredit", () => grantReferralCreditInner(...args));
}

async function grantReferralCreditInner(customerId: string, sourceId: string): Promise<number> {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("grant_referral_credit", { p_customer_id: customerId, p_source_id: sourceId });
  // DB関数の日本語のメッセージ（二重付与・窓口のトークなど）はそのまま見せる。
  if (error) throw new Error(error.message);
  return data;
}

export async function revokeReferralCredit(...args: Parameters<typeof revokeReferralCreditInner>) {
  return toResult("revokeReferralCredit", () => revokeReferralCreditInner(...args));
}

async function revokeReferralCreditInner(customerId: string): Promise<number> {
  await requireHqPrivileged();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_referral_credit", { p_customer_id: customerId });
  if (error) throw new Error(error.message);
  return data;
}
