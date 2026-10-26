import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { notifyEmailChanged } from "@/lib/notify";

// Magic-link landing page: Supabase emails a link to this route with
// ?token_hash=...&type=... . Verifying it signs the browser into whatever
// account the email belongs to (an existing customer's real account, in our
// case) — replacing whatever anonymous guest session was active before.
const OTP_TYPES = ["email", "magiclink", "signup", "recovery", "invite", "email_change"] as const;
type OtpType = (typeof OTP_TYPES)[number];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  // 外のサイトへ飛ばされないよう、アプリ内のパス（/ 始まり、// や \ を含まない）だけ受け付ける。
  const rawNext = searchParams.get("next") ?? "/";
  const next = /^\/(?![\/\\])[^\\]*$/.test(rawNext) ? rawNext : "/";
  // 問い合わせ窓口（/teera など）から送ったリンクなら、その窓口に戻す。
  const cookieStore = await cookies();
  const deskPath = cookieStore.get("vid_next")?.value;
  const base = deskPath && /^\/[a-z0-9-]+$/.test(deskPath) ? deskPath : "";

  if (tokenHash && typeParam && (OTP_TYPES as readonly string[]).includes(typeParam)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: typeParam as OtpType, token_hash: tokenHash });
    if (!error) {
      if (typeParam === "email_change") await afterEmailChange(supabase);
      if (base) cookieStore.delete("vid_next");
      // 「パスワードをお忘れの方」から来たときは、パスワード設定を開いた状態で迎える。
      if (cookieStore.get("vid_setpw")) {
        cookieStore.delete("vid_setpw");
        return NextResponse.redirect(`${origin}${base || "/"}?setpw=1`);
      }
      return NextResponse.redirect(`${origin}${base || next}`);
    }
  }

  return NextResponse.redirect(`${origin}${base || "/"}?loginError=1`);
}

// メールアドレス変更の確認が通ったら、前のアドレスへお知らせする。
// アドレスがまだ切り替わっていない（＝確認の途中）ときは何もしない。
async function afterEmailChange(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const prev = user?.user_metadata?.prev_email;
  if (!user?.email || typeof prev !== "string" || !prev || prev === user.email) return;
  await notifyEmailChanged(user.id, prev);
  const admin = createServiceRoleClient();
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, prev_email: null } });
}
