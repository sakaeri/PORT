import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && typeParam && (OTP_TYPES as readonly string[]).includes(typeParam)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: typeParam as OtpType, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?loginError=1`);
}
