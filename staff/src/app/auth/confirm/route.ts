import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// パスワード再設定メールのリンク landing。Supabaseからのメールにtoken_hashが
// 直接入っている前提で作る（標準の{{ .ConfirmationURL }}だとSupabase自身の
// サーバー経由になってしまい、ここに必要な情報が渡らない。メールテンプレート
// 側で {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
// の形にしておくこと）。
const OTP_TYPES = ["email", "recovery", "invite", "email_change"] as const;
type OtpType = (typeof OTP_TYPES)[number];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const next = searchParams.get("next") ?? (typeParam === "recovery" ? "/reset-password" : "/");

  if (tokenHash && typeParam && (OTP_TYPES as readonly string[]).includes(typeParam)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: typeParam as OtpType, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?resetError=1`);
}
