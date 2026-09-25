import type { AppRole, StaffRole } from "@/lib/supabase/types";

// dept_leader はDB上の名残の値。表示上は「スタッフ」（依頼主とは直接
// やり取りせず、案件ごとに個別に割り当てられた案件について社内トークで
// 作業する役割）。窓口には所属しない — マネージャーが案件ごとに直接
// 「＋スタッフ追加」するので、窓口の割り当ては不要。
export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "オーナー",
  dept_manager: "マネージャー",
  dept_leader: "スタッフ",
};
export const INVITE_ROLES: StaffRole[] = ["dept_manager", "dept_leader"];
export const isDeptScoped = (role: StaffRole) => role === "dept_manager";

// スタッフ内トーク（案件トーク・スタッフ⇄本部トーク）で「誰が送ったか」を
// 一覧・トーク双方で同じ表記に揃えるためのラベル。profilesとのjoinには
// 頼らず、メッセージ自体が持つsender_roleだけで決まる（RLSやjoinの失敗に
// 影響されない、確実な方法）。
export function staffSenderLabel(role: AppRole | null): string {
  if (role && role in ROLE_LABEL) return ROLE_LABEL[role as StaffRole];
  if (role === "reception") return "受付";
  return "スタッフ";
}
