"use server";

import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";

async function requireContext() {
  const ctx = await getStaffContext();
  if (!ctx) throw new Error("権限がありません");
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
