import type { StaffRole } from "@/lib/supabase/types";

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
