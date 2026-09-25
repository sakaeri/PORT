import type { StaffRole } from "@/lib/supabase/types";

// dept_leader はDB上の名残の値。表示上は「スタッフ」（依頼主とは直接
// やり取りせず、担当窓口の案件について社内トークで作業する役割）。
export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "オーナー",
  dept_manager: "マネージャー",
  dept_leader: "スタッフ",
};
export const INVITE_ROLES: StaffRole[] = ["dept_manager", "dept_leader"];
export const isDeptScoped = (role: StaffRole) => role === "dept_manager" || role === "dept_leader";
