import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same runtime purpose).
// Staff log in with a real email/password (no anonymous sign-in, unlike the
// client app) — this just refreshes the session cookie and sends anyone
// without a session to /login. Role checking (owner/reception only) happens
// in the authenticated layout, since it needs a DB read.
//
// Also forwards the staff_org_id cookie (set by the sidebar org switcher,
// see switchStaffOrg()) as an x-vid-org header, the same mechanism the
// client app uses, so one login can act as staff of more than one org
// (see 20260914000002_staff_multi_org.sql).
export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const currentOrgId = request.cookies.get("staff_org_id")?.value;
  if (currentOrgId) requestHeaders.set("x-vid-org", currentOrgId);

  // Cookie writes from the Supabase client are collected here and applied
  // once, at the end, after the response is built from the finalized
  // headers — building the response earlier (as this used to) risked a
  // request that never re-set a cookie being returned without the header
  // ever making it on (see the identical bug fixed in the client app's
  // proxy.ts).
  const pendingCookies: { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];

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
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  // /signup: LPからの公開セルフサインアップ（未ログインでも入れる必要がある）。
  // /api/stripe-webhook: Stripeサーバーからの通知（ログインセッションを持たない）。
  const isPublicRoute =
    isLoginRoute || request.nextUrl.pathname.startsWith("/signup") || request.nextUrl.pathname.startsWith("/api/stripe-webhook");

  if (!data.user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (data.user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
