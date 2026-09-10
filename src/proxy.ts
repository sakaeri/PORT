import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same runtime purpose).
// Refreshes the Supabase auth session cookie on every request so a customer's
// anonymous session doesn't silently expire mid-conversation. Also resolves
// which org this domain belongs to and forwards it as x-vid-org so RLS
// (auth_org(), see 20260910000003_multi_org_customers.sql) can scope a
// customer's data to the org they're actually visiting, even if the same
// login is also a customer of other orgs.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const host = request.headers.get("host") ?? "";
  const { data: orgId } = await supabase.rpc("org_id_by_domain", { p_domain: host });
  if (orgId) requestHeaders.set("x-vid-org", orgId);

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // First visit: start the customer's session with no signup screen. The
    // handle_new_customer trigger (see supabase/migrations) provisions their
    // profile row as soon as this auth.users row exists; the customers/threads
    // row for whichever org they're visiting is provisioned on demand by
    // getCustomerContext() (a shared login may be a customer of several orgs).
    await supabase.auth.signInAnonymously();
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
