"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

const browserClients = new Map<string, ReturnType<typeof createBrowserClient<Database>>>();

// orgId is baked in once per page load (a given domain always resolves to the
// same org) and sent as x-vid-org on every request, so RLS (auth_org()) knows
// which org this browser is currently visiting — see 20260910000003_multi_org_customers.sql.
// Cached per orgId (not a single shared instance): a caller that doesn't need
// org scoping (sign-out, avatar upload) must not hand back a client missing
// the header to a caller that does, or RLS silently filters everything out.
export function createClient(orgId?: string) {
  const key = orgId ?? "";
  const cached = browserClients.get(key);
  if (cached) return cached;
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    orgId ? { global: { headers: { "x-vid-org": orgId } } } : undefined,
  );
  browserClients.set(key, client);
  return client;
}
