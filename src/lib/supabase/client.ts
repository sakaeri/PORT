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
// deskId: 問い合わせ窓口のトークを見ているときは、その窓口の依頼主として読む（x-vid-desk）。
export function createClient(orgId?: string, deskId?: string | null) {
  const key = `${orgId ?? ""}:${deskId ?? ""}`;
  const cached = browserClients.get(key);
  if (cached) return cached;
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    orgId ? { global: { headers: { "x-vid-org": orgId, ...(deskId ? { "x-vid-desk": deskId } : {}) } } } : undefined,
  );
  browserClients.set(key, client);
  return client;
}
