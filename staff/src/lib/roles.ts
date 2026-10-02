import type { AppRole, StaffRole } from "@/lib/supabase/types";

// dept_leader はDB上の名残の値。表示上は「スタッフ」（依頼主とは直接
// やり取りせず、案件ごとに個別に割り当てられた案件について社内トークで
// 作業する役割）。
export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "本部メンバー",
  dept_manager: "マネージャー",
  dept_leader: "スタッフ",
};
export const INVITE_ROLES: StaffRole[] = ["dept_manager", "dept_leader"];
// マネージャーの窓口は昇格時に自動でできるので選択肢に出さない。
// スタッフの窓口は「どのマネージャーに割り当てられているか」を表す
// タグ（任意・未設定可）で、ここだけ選べるようにする。
export const isDeptScoped = (role: StaffRole) => role === "dept_leader";

// スタッフ内トーク（案件トーク・スタッフ⇄本部トーク）で「誰が送ったか」を
// 一覧・トーク双方で同じ表記に揃えるためのラベル。profilesとのjoinには
// 頼らず、メッセージ自体が持つsender_roleだけで決まる（RLSやjoinの失敗に
// 影響されない、確実な方法）。
export function staffSenderLabel(role: AppRole | null): string {
  if (role && role in ROLE_LABEL) return ROLE_LABEL[role as StaffRole];
  if (role === "reception") return "受付";
  return "スタッフ";
}
