import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { readEmailOpenToken } from "@/lib/email-link";

// 通知メールのボタンの着地点（lib/email-link.ts）。リンクが正しければ、あて先の人として
// ログインした状態にしてから目的の画面へ送る。すでにその人でログインしていればそのまま開く。
// 期限切れ・別の人あて・うまくいかなかったときは、ログインはせずに目的の画面だけ開く
// （ふだん通りログインを求められる）。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const link = readEmailOpenToken(searchParams.get("t"));
  if (!link) return NextResponse.redirect(`${origin}/`);
  const target = `${origin}${link.path}`;

  const supabase = await createClient();
  const { data: current } = await supabase.auth.getUser();
  if (current.user?.id === link.userId || link.expired) return NextResponse.redirect(target);

  try {
    const admin = createServiceRoleClient();
    const { data: u } = await admin.auth.admin.getUserById(link.userId);
    const email = u.user?.email;
    if (email) {
      const { data: gen, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (!error && gen.properties?.hashed_token) {
        await supabase.auth.verifyOtp({ type: "magiclink", token_hash: gen.properties.hashed_token });
      }
    }
  } catch (e) {
    console.error("auth/open", e);
  }
  return NextResponse.redirect(target);
}
