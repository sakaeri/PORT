import type { StaffRole } from "@/lib/supabase/types";

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "オーナー",
  supervisor: "統括担当",
  dept_manager: "窓口マネージャー",
  dept_leader: "窓口リーダー",
};
export const INVITE_ROLES: StaffRole[] = ["supervisor", "dept_manager", "dept_leader"];
export const isDeptScoped = (role: StaffRole) => role === "dept_manager" || role === "dept_leader";
