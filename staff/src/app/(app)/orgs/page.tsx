import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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

  // 評価・意見は他事業者を横断するので、is_hq_staff() のRLSが
  // 及ばない（organizations自体しか許可していない）。本部専用ページとして
  // 既に requireHqPrivileged 相当のガード（!ctx.isHq なら redirect）を
  // 通しているので、ここだけ service role で読む。
  const admin = createServiceRoleClient();
  const ninetyDaysAgo = new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: ratingRows }, { data: feedbackRows }] = await Promise.all([
    admin.from("ratings").select("stars, requests!inner(org_id)").eq("skipped", false).gte("created_at", ninetyDaysAgo),
    admin.from("hq_feedback").select("id, org_id, body, created_at, read_at").order("created_at", { ascending: false }),
  ]);

  const ratingSumByOrg = new Map<string, { sum: number; count: number }>();
  for (const r of ratingRows ?? []) {
    const req = Array.isArray(r.requests) ? r.requests[0] : r.requests;
    if (!req || r.stars == null) continue;
    const cur = ratingSumByOrg.get(req.org_id) ?? { sum: 0, count: 0 };
    cur.sum += r.stars;
    cur.count += 1;
    ratingSumByOrg.set(req.org_id, cur);
  }

  const feedbackByOrg = new Map<string, { id: string; body: string; created_at: string; read_at: string | null }[]>();
  for (const f of feedbackRows ?? []) {
    const list = feedbackByOrg.get(f.org_id) ?? [];
    list.push({ id: f.id, body: f.body, created_at: f.created_at, read_at: f.read_at });
    feedbackByOrg.set(f.org_id, list);
  }

  const enrichedOrgs = (orgs ?? []).map((o) => {
    const rating = ratingSumByOrg.get(o.id);
    return {
      ...o,
      avgRating: rating ? rating.sum / rating.count : null,
      ratingCount: rating?.count ?? 0,
      feedback: feedbackByOrg.get(o.id) ?? [],
    };
  });

  return <OrgsAdmin initialOrgs={enrichedOrgs} loadError={!!error} />;
}
