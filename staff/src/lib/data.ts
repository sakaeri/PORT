import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface StaffContext {
  userId: string;
  orgId: string;
  orgDisplayName: string;
  role: "owner" | "reception";
  displayName: string;
  solo: boolean;
}

// null means: not logged in, or logged in but not owner/reception (e.g. a
// creator-role account, which belongs to the separate not-yet-built staff
// app for production work, not this reception app).
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, display_name")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile || (profile.role !== "owner" && profile.role !== "reception")) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("display_name, solo")
    .eq("id", profile.org_id)
    .maybeSingle();

  return {
    userId: auth.user.id,
    orgId: profile.org_id,
    orgDisplayName: org?.display_name ?? "窓口",
    role: profile.role,
    displayName: profile.display_name,
    solo: org?.solo ?? false,
  };
});
