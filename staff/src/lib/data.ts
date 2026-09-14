import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface StaffOrgOption {
  orgId: string;
  displayName: string;
  role: "owner" | "reception";
  isPrimary: boolean;
}

export interface StaffContext {
  userId: string;
  orgId: string;
  orgDisplayName: string;
  role: "owner" | "reception";
  displayName: string;
  solo: boolean;
  isHq: boolean;
  orgs: StaffOrgOption[];
}

// null means: not logged in, or logged in but not owner/reception (e.g. a
// creator-role account, which belongs to the separate not-yet-built staff
// app for production work, not this reception app).
//
// orgId is whichever org the staff_org_id cookie (set by the sidebar org
// switcher) currently points to, defaulting to the login's own primary org
// (profiles.org_id) when no cookie is set — see 20260914000002_staff_multi_org.sql.
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: ctx }, { data: orgs }] = await Promise.all([
    supabase.rpc("staff_context").maybeSingle(),
    supabase.rpc("my_staff_orgs"),
  ]);
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "reception")) return null;

  return {
    userId: auth.user.id,
    orgId: ctx.org_id,
    orgDisplayName: ctx.org_display_name ?? "窓口",
    role: ctx.role,
    displayName: ctx.display_name ?? "スタッフ",
    solo: ctx.solo ?? false,
    isHq: ctx.is_hq ?? false,
    orgs: (orgs ?? []).map((o) => ({ orgId: o.org_id, displayName: o.display_name, role: o.role as "owner" | "reception", isPrimary: o.is_primary })),
  };
});
