import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/supabase/types";

export interface StaffContext {
  userId: string;
  email: string;
  orgId: string;
  orgDisplayName: string;
  role: StaffRole | "reception";
  displayName: string;
  avatarUrl: string | null;
}

const STAFF_ROLES = ["owner", "reception", "dept_manager", "dept_leader"] as const;

// null means: not logged in, or logged in but not one of STAFF_ROLES (e.g. a
// creator-role account — that belongs to the separate, not-yet-built
// production-staff app).
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: ctx }, { data: profileRow }] = await Promise.all([
    supabase.rpc("staff_context").maybeSingle(),
    supabase.from("profiles").select("avatar_url").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!ctx || !(STAFF_ROLES as readonly string[]).includes(ctx.role)) return null;

  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    orgId: ctx.org_id,
    orgDisplayName: ctx.org_display_name ?? "窓口",
    role: ctx.role as StaffRole | "reception",
    displayName: ctx.display_name ?? "スタッフ",
    avatarUrl: profileRow?.avatar_url ?? null,
  };
});
