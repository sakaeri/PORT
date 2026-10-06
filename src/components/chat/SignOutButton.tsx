"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({ label = "ログアウト", onSignedOut }: { label?: string; onSignedOut?: () => void }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await createClient().auth.signOut();
    onSignedOut?.();
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      style={{ height: 36, padding: "0 16px", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
    >
      {signingOut ? "処理中…" : label}
    </button>
  );
}
