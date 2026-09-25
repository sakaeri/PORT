"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { headingWeight } from "@/lib/style";
import { errorMessage } from "@/lib/errors";
import { acceptStaffInvite } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/supabase/types";

const card: React.CSSProperties = {
  padding: 20,
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const input: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  fontSize: 13.5,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
const label: React.CSSProperties = { fontSize: 12, color: "var(--color-neutral-500)" };
const primaryBtn: React.CSSProperties = {
  height: 40,
  padding: "0 18px",
  cursor: "pointer",
  fontSize: 13.5,
  color: "var(--color-accent-100)",
  background: "var(--color-accent-900)",
  border: "1px solid var(--color-accent)",
  borderRadius: "var(--radius-md)",
};

export default function JoinForm({
  inviteId,
  invite,
}: {
  inviteId: string;
  invite: { role: StaffRole; valid: boolean; orgDisplayName: string } | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!invite || !invite.valid) {
    return (
      <div style={card}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 18 }}>この招待リンクは無効です</div>
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)", lineHeight: 1.6 }}>すでに使われているか、URLが正しくありません。すでに登録済みの方はログインしてください。心当たりがない場合は招待した本部の方にご確認ください。</div>
        <Link href="/login" style={{ ...primaryBtn, display: "grid", placeItems: "center", textDecoration: "none", alignSelf: "flex-start" }}>
          ログイン
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await acceptStaffInvite(inviteId, { email, password, displayName });
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "登録できませんでした"));
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 22 }}>{invite.orgDisplayName}に参加</div>
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)", marginTop: 4 }}>ログイン情報を設定してください。</div>
      </div>

      <form onSubmit={submit} style={card}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={label}>表示名</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="vid-input" style={input} required />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={label}>ログインメールアドレス</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="vid-input" style={input} required />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={label}>パスワード（8文字以上）</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="vid-input" style={input} required minLength={8} />
        </div>

        {error && <span style={{ fontSize: 11.5, color: "var(--color-accent-200)" }}>{error}</span>}

        <button type="submit" disabled={submitting} style={{ ...primaryBtn, alignSelf: "flex-start" }}>
          {submitting ? "登録中…" : "登録して始める"}
        </button>
      </form>
    </div>
  );
}
