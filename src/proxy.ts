import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same runtime purpose).
// Refreshes the Supabase auth session cookie on every request so a customer's
// anonymous session doesn't silently expire mid-conversation. Also resolves
// which org this request belongs to and forwards it as x-vid-org so RLS
// (auth_org(), see 20260910000003_multi_org_customers.sql) can scope a
// customer's data to the org they're actually visiting, even if the same
// login is also a customer of other orgs.
//
// Org resolution: a new org normally needs no Vercel/DNS work at all — it's
// reached at /<slug> on the existing domain (e.g. port.example.com/a-company),
// resolved from the first path segment and internally rewritten to "/" so
// page.tsx doesn't need to know about it. A custom domain (org_id_by_domain)
// is only for a future case where a company wants their own domain instead.
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Rewriting to "/" keeps the visible URL as /<slug> while page.tsx renders
  // unchanged; the org comes from the x-vid-org header either way.
  let targetUrl: URL | null = null;
  const makeResponse = () =>
    targetUrl
      ? NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  let response = makeResponse();

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
          response = makeResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const firstSegment = request.nextUrl.pathname.split("/")[1] || "";
  let orgId: string | null = null;
  if (firstSegment) {
    orgId = (await supabase.rpc("org_id_by_slug", { p_slug: firstSegment })).data;
    if (orgId) {
      targetUrl = request.nextUrl.clone();
      targetUrl.pathname = "/" + request.nextUrl.pathname.split("/").slice(2).join("/");
      response = makeResponse();
    }
  }
  if (!orgId) {
    const host = request.headers.get("host") ?? "";
    const { data, error } = await supabase.rpc("org_id_by_domain", { p_domain: host });
    orgId = data;
    if (!orgId) console.error("proxy: org_id_by_domain resolved no org", { host, error });
  }
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
