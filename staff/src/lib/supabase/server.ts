import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Next.js 16: cookies() is async-only. Call this fresh per request (Server
// Component / Route Handler / Server Action) — do not cache the client.
export async function createClient() {
  const cookieStore = await cookies();
  // proxy.ts reads the staff_org_id cookie (set by the org switcher) and
  // forwards it as this header so auth_org()/auth_role() resolve against
  // whichever org the staff member is currently viewing, not just their
  // primary profiles.org_id. See 20260914000002_staff_multi_org.sql.
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
