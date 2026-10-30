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
// 事業所は中央秘書事務所の1つだけ（org_id_by_domain が既定の事業所を返す）。
// 先頭のパス（/teera など）が問い合わせ窓口の合言葉なら、"/" に内部で
// 書き換えて窓口として表示する。
// アプリ自身のページ。窓口の合言葉としては使えない。
const RESERVED_SEGMENTS = new Set(["auth", "terms", "legal", "api", "manifest.webmanifest"]);

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Rewriting to "/" keeps the visible URL as /<slug> while page.tsx renders
  // unchanged.
  let targetUrl: URL | null = null;
  // Cookie writes from the Supabase client are collected here and applied to
  // the response once, at the very end — the response itself is only built
  // after requestHeaders (incl. x-vid-org) is fully finalized. Building it
  // earlier (as this used to) meant a request that never re-set a cookie
  // (an already-signed-in visitor whose session didn't need a refresh) would
  // be returned without the x-vid-org header ever making it onto the response.
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

  // 事業所・問い合わせ窓口は外から偽れないよう、毎回ここで決め直す。
  requestHeaders.delete("x-vid-org");
  requestHeaders.delete("x-vid-desk");
  requestHeaders.delete("x-vid-desk-slug");

  const firstSegment = request.nextUrl.pathname.split("/")[1] || "";
  let orgId: string | null = null;
  if (firstSegment && !RESERVED_SEGMENTS.has(firstSegment)) {
    const { data: desks } = await supabase.rpc("desk_by_slug", { p_slug: firstSegment });
    const desk = desks?.[0];
    if (desk) {
      orgId = desk.org_id;
      requestHeaders.set("x-vid-desk", desk.id);
      requestHeaders.set("x-vid-desk-slug", firstSegment);
      targetUrl = request.nextUrl.clone();
      targetUrl.pathname = "/" + request.nextUrl.pathname.split("/").slice(2).join("/");
    }
  }
  if (!orgId) {
    const host = request.headers.get("host") ?? "";
    const { data, error } = await supabase.rpc("org_id_by_domain", { p_domain: host });
    orgId = data;
    if (!orgId) console.error("proxy: org_id_by_domain resolved no org", { host, error });
  }
  if (orgId) requestHeaders.set("x-vid-org", orgId);

  // Calling getUser() here (result unused) is what actually refreshes an
  // existing session's cookie via the setAll callback above — this is why
  // this call stays even though nothing here still auto-signs a visitor in.
  // First visit: no automatic anonymous sign-in anymore. page.tsx renders
  // VerifyGate instead, which runs an invisible Cloudflare Turnstile check
  // and only then calls completeAnonymousEntry() (a Server Action — this
  // middleware can't run browser JS to solve the challenge). The
  // handle_new_customer trigger provisions the profile row as soon as that
  // auth.users row exists; the customers/threads row for whichever org
  // they're visiting is provisioned on demand by getCustomerContext() (a
  // shared login may be a customer of several orgs).
  await supabase.auth.getUser();

  const response = targetUrl
    ? NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
