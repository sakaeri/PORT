import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/data";
import OrgsAdmin from "@/components/OrgsAdmin";

export default async function OrgsPage() {
  const ctx = await getStaffContext();
  if (!ctx) return null;
  if (!ctx.isHq) redirect("/customers");

  const supabase = await createClient();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, display_name, slug, plan_status, created_at")
    .eq("is_hq", false)
    .order("created_at", { ascending: false });

  return <OrgsAdmin initialOrgs={orgs ?? []} loadError={!!error} />;
}
