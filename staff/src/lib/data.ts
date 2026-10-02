import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/supabase/types";

export interface StaffOrgOption {
  orgId: string;
  displayName: string;
  role: "owner" | "reception";
  isPrimary: boolean;
  slug: string | null;
}

export interface StaffContext {
  userId: string;
  email: string;
  orgId: string;
  orgDisplayName: string;
  role: StaffRole | "reception";
  displayName: string;
  isHq: boolean;
  orgs: StaffOrgOption[];
  planStatus: "trial" | "active" | "past_due" | "paused" | "cancelled";
  trialEndsOn: string | null;
  // トライアル終了後（または滞納・停止）で、新規のやり取りなど書き込み系を
  // 止めるべき状態かどうか。閲覧は常にできる（データを人質にしない）。
  // PORT本部の事業者（isHq）は対象外。
  isLocked: boolean;
}

const STAFF_ROLES = ["owner", "reception", "dept_manager", "dept_leader"] as const;

// null means: not logged in, or logged in but not one of STAFF_ROLES (e.g. a
// creator-role account — that belongs to the separate, not-yet-built
// production-staff app).
//
// orgId is whichever org the staff_org_id cookie (set by the sidebar org
// switcher) currently points to, defaulting to the login's own primary org
// (profiles.org_id) when no cookie is set — see 20260914000002_staff_multi_org.sql.
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: rawCtx }, { data: orgs }] = await Promise.all([
    supabase.rpc("staff_context").maybeSingle(),
    supabase.rpc("my_staff_orgs"),
  ]);

  let ctx = rawCtx;
  if (!ctx || !(STAFF_ROLES as readonly string[]).includes(ctx.role)) {
    // staff_org_id Cookie（x-vid-org ヘッダー）が、今のログインが権限を
    // 持たない事業者を指している可能性がある（複数タブで別の事業者に
    // 切り替えた直後など）。即座に「権限がありません」にはせず、本人の
    // 本来の事業者（profiles.org_id）で解決できないか試してから諦める。
    const { data: fallback } = await supabase.rpc("staff_context_for_own_org").maybeSingle();
    if (fallback && (STAFF_ROLES as readonly string[]).includes(fallback.role)) ctx = fallback;
  }
  if (!ctx || !(STAFF_ROLES as readonly string[]).includes(ctx.role)) return null;

  const isHq = ctx.is_hq ?? false;
  const planStatus = ctx.plan_status ?? "trial";
  const trialEndsOn = ctx.trial_ends_on ?? null;
  const trialExpired = trialEndsOn != null && trialEndsOn < new Date().toISOString().slice(0, 10);
  const isLocked = !isHq && (planStatus === "past_due" || planStatus === "paused" || planStatus === "cancelled" || (planStatus === "trial" && trialExpired));

  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    orgId: ctx.org_id,
    orgDisplayName: ctx.org_display_name ?? "窓口",
    role: ctx.role as StaffRole | "reception",
    displayName: ctx.display_name ?? "スタッフ",
    isHq,
    orgs: (orgs ?? []).map((o) => ({ orgId: o.org_id, displayName: o.display_name, role: o.role as "owner" | "reception", isPrimary: o.is_primary, slug: o.slug })),
    planStatus,
    trialEndsOn,
    isLocked,
  };
});
