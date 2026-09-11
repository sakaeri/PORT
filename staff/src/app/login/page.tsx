"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { headingWeight } from "@/lib/style";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? "メールアドレスかパスワードが正しくありません" : "ログインできませんでした");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: "var(--space-4)" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: "min(360px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 24,
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>PORT 受付</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>メールアドレス</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="vid-input"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>パスワード</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="vid-input"
            style={inputStyle}
          />
        </div>
        {error && <span style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{error}</span>}
        <button
          type="submit"
          disabled={sending}
          style={{
            height: 40,
            marginTop: 4,
            cursor: sending ? "wait" : "pointer",
            fontSize: 13.5,
            color: "var(--color-accent-100)",
            background: "var(--color-accent-900)",
            border: "1px solid var(--color-accent)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {sending ? "ログイン中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "6px 12px",
  fontSize: 14,
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  outline: "none",
};
