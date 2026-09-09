"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getCustomerContext, getRefundPolicies } from "@/lib/data";
import { computeRefund } from "@/lib/refund";
import { revalidatePath } from "next/cache";

async function requireContext() {
  const ctx = await getCustomerContext();
  if (!ctx) throw new Error("認証されていません");
  return ctx;
}

export async function sendMessage(text: string, attachments: { path: string; name: string; mime: string; bytes: number }[]) {
  const ctx = await requireContext();
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
  revalidatePath("/");
}

export async function submitMenuInquiry(
  menuId: string,
  menuLabel: string,
  menuIcon: string | null,
  rows: { label: string; value: string }[],
  note: string,
) {
  const ctx = await requireContext();
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
  revalidatePath("/");
}

export async function saveVaultItem(id: string | null, label: string, value: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  if (id) {
    await supabase.from("customer_vault_items").update({ label, value, updated_at: new Date().toISOString() }).eq("id", id);
  } else {
    await supabase.from("customer_vault_items").insert({ customer_id: ctx.customerId, label, value });
  }
  revalidatePath("/");
}

export async function submitInfoRequestAnswer(messageId: string, fields: { key: string; value: string }[]) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const filled = fields.filter((f) => f.value.trim());
  if (!filled.length) return;

  for (const f of filled) {
    const { data: existing } = await supabase
      .from("customer_vault_items")
      .select("id")
      .eq("customer_id", ctx.customerId)
      .eq("label", f.key)
      .maybeSingle();
    if (existing) {
      await supabase.from("customer_vault_items").update({ value: f.value.trim() }).eq("id", existing.id);
    } else {
      await supabase.from("customer_vault_items").insert({ customer_id: ctx.customerId, label: f.key, value: f.value.trim() });
    }
  }

  const { data: msg } = await supabase.from("messages").select("payload").eq("id", messageId).single();
  await supabase
    .from("messages")
    .update({ payload: { ...(msg?.payload as object), filled: true } })
    .eq("id", messageId);

  // sender_id なし = システム発。customer 自身の RLS では null 送信者を名乗れない
  // （customers_send は sender_id = auth.uid() を要求）ため、ここだけ service-role で書く。
  const admin = createServiceRoleClient();
  await admin.from("messages").insert({
    thread_id: ctx.threadId,
    sender_id: null,
    sender_role: null,
    kind: "notice",
    body: `${filled.map((f) => f.key).join("・")}を登録しました（トークには残りません）`,
  });
  revalidatePath("/");
}

// 受付への依頼として本人発言のまま投稿する（自動応答は作らない — 実際の返信は
// 受付が対応してから届く。プロトタイプの「即座に受付が返信する」演出は本番では行わない）。
export async function requestNameChange(newName: string, reason: string) {
  const ctx = await requireContext();
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
  revalidatePath("/");
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
  if (emailErr) throw emailErr;

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
  revalidatePath("/");
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
  revalidatePath("/");
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
  revalidatePath("/");
}

export async function skipRating(requestId: string) {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ratings")
    .insert({ request_id: requestId, customer_id: ctx.customerId, stars: null, skipped: true });
  if (error) throw error;
  revalidatePath("/");
}

// 決済・返金は customer 自身の RLS 権限では requests を更新できない設計（意図的）。
// 実カード決済は Stripe Connect Standard 導入後、ここを PaymentIntent 作成 +
// webhook 確定に置き換える。今は Stripe 未接続のため service-role 経由で即時確定する。
export async function payRequest(requestId: string) {
  const ctx = await requireContext();
  const admin = createServiceRoleClient();

  const { data: r, error } = await admin
    .from("requests")
    .select("*")
    .eq("id", requestId)
    .eq("customer_id", ctx.customerId)
    .single();
  if (error || !r) throw new Error("見積もりが見つかりません");
  if (r.phase !== "quoted") throw new Error("この見積もりはすでに処理済みです");

  const now = new Date().toISOString();
  await admin
    .from("requests")
    .update({ phase: "preparing", accepted_at: now, pay_method: "card", pay_status: "paid", paid_at: now })
    .eq("id", requestId);

  const { data: thread } = await admin.from("threads").select("id").eq("id", ctx.threadId).single();
  if (thread) {
    await admin.from("messages").insert({
      thread_id: thread.id,
      sender_id: null,
      sender_role: null,
      kind: "notice",
      request_id: requestId,
      body: `${r.amount.toLocaleString("ja-JP")}円の決済が完了しました。進捗はカードでご確認いただけます`,
    });
  }
  revalidatePath("/");
}

export async function sendHandlerChangeRequest() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({
    thread_id: ctx.threadId,
    sender_id: ctx.userId,
    sender_role: "client",
    kind: "text",
    body: "担当の変更について相談したいです。",
  });
  if (error) throw error;
  revalidatePath("/");
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

  revalidatePath("/");
}
