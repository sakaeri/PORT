"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

// orgId is baked in once per page load (a given domain always resolves to the
// same org) and sent as x-vid-org on every request, so RLS (auth_org()) knows
// which org this browser is currently visiting — see 20260910000003_multi_org_customers.sql.
export function createClient(orgId?: string) {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    orgId ? { global: { headers: { "x-vid-org": orgId } } } : undefined,
  );
  return browserClient;
}
