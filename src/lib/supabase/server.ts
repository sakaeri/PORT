import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Next.js 16: cookies() is async-only. Call this fresh per request (Server
// Component / Route Handler / Server Action) — do not cache the client.
export async function createClient() {
  const cookieStore = await cookies();
  // proxy.ts resolves the org from the request's domain and forwards it as
  // this header; auth_org() reads it to scope a multi-org customer's data to
  // whichever org's site they're currently on. See 20260910000003_multi_org_customers.sql.
  const h = await headers();
  const orgId = h.get("x-vid-org");

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: orgId ? { headers: { "x-vid-org": orgId } } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — proxy.ts refreshes
            // the session on the next request, so this can be ignored.
          }
        },
      },
    },
  );
}

// Service-role client for trusted server-side mutations that must not go
// through the caller's own RLS grant (payment confirmation, refunds).
// Never import this from a Client Component or expose the key to the browser.
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
