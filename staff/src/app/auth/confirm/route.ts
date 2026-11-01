import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ログイン用メール（とメールアドレス変更の確認メール）のリンクの着地点。Supabaseからの
// メールにtoken_hashが直接入っている前提で作る（標準の{{ .ConfirmationURL }}だと
// Supabase自身のサーバー経由になってしまい、ここに必要な情報が渡らない。メール
// テンプレート側で {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink の形にしておくこと）。
const OTP_TYPES = ["email", "magiclink", "invite", "email_change"] as const;
type OtpType = (typeof OTP_TYPES)[number];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  // 外のサイトへ飛ばされないよう、アプリ内のパス（/ 始まり、// や \ を含まない）だけ受け付ける。
  const rawNext = searchParams.get("next") ?? "/";
  const next = /^\/(?![\/\\])[^\\]*$/.test(rawNext) ? rawNext : "/";

  if (tokenHash && typeParam && (OTP_TYPES as readonly string[]).includes(typeParam)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: typeParam as OtpType, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?linkError=1`);
}
