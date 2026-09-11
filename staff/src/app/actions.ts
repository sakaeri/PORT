"use server";

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
export async function createOrgAccount(fields: {
  name: string;
  display_name: string;
  rep_name: string;
  tel: string;
  email: string;
  slug: string;
  owner_email: string;
  owner_password: string;
  owner_display_name: string;
}) {
  await requireHq();

  const slug = fields.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || slug === "auth") {
    throw new Error("URLの合言葉は半角英数字とハイフンのみ・2〜40文字で入力してください");
  }
  if (fields.owner_password.length < 8) {
    throw new Error("パスワードは8文字以上にしてください");
  }
  if (!fields.name.trim() || !fields.display_name.trim() || !fields.owner_email.trim()) {
    throw new Error("正式名称・表示名・オーナーのメールアドレスは必須です");
  }

  const admin = createServiceRoleClient();

  const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (existing) throw new Error("このURLの合言葉はすでに使われています");

  const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
    email: fields.owner_email.trim(),
    password: fields.owner_password,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    throw new Error(userErr?.message.includes("already been registered") ? "このメールアドレスはすでに使われています" : (userErr?.message ?? "アカウントを作成できませんでした"));
  }
  const userId = userRes.user.id;

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
  if (orgErr || !org) {
    await admin.auth.admin.deleteUser(userId);
    throw orgErr ?? new Error("事業者を作成できませんでした");
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    org_id: org.id,
    role: "owner",
    display_name: fields.owner_display_name.trim() || fields.rep_name.trim() || fields.display_name.trim(),
  });
  if (profileErr) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(userId);
    throw profileErr;
  }

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
