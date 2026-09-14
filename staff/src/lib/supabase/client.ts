"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;
let cachedOrgId: string | undefined;

// orgId is optional because /login has no org context yet; once a Shell with
// a known ctx.orgId calls this, we must not keep serving an earlier client
// that was cached without the x-vid-org header (that would silently scope
// every query to the wrong org for multi-org staff), so recreate whenever
// the requested orgId differs from what's cached.
export function createClient(orgId?: string) {
  if (browserClient && cachedOrgId === orgId) return browserClient;
  cachedOrgId = orgId;
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    orgId ? { global: { headers: { "x-vid-org": orgId } } } : undefined,
  );
  return browserClient;
}
