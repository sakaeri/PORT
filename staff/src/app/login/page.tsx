"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

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

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (forgotSending) return;
    setForgotSending(true);
    setForgotError("");
    try {
      await requestPasswordReset(forgotEmail);
      setForgotSent(true);
    } catch (e) {
      setForgotError(errorMessage(e, "送信できませんでした"));
    } finally {
      setForgotSending(false);
    }
  }

  if (forgotOpen) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: "var(--space-4)" }}>
        <form
          onSubmit={handleForgotSubmit}
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
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>パスワードの再設定</div>
          {forgotSent ? (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              入力されたメールアドレス宛てに、再設定用のリンクを送りました（登録が無いアドレスには届きません）。メールをご確認ください。
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>登録済みのメールアドレス</label>
                <input type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="vid-input" style={inputStyle} />
              </div>
              {forgotError && <span style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{forgotError}</span>}
              <button
                type="submit"
                disabled={forgotSending}
                style={{ height: 40, marginTop: 4, cursor: forgotSending ? "wait" : "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
              >
                {forgotSending ? "送信中…" : "再設定リンクを送る"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setForgotOpen(false);
              setForgotSent(false);
              setForgotError("");
            }}
            style={{ height: 32, cursor: "pointer", fontSize: 12.5, color: "var(--color-neutral-400)", background: "transparent", border: "none" }}
          >
            ログイン画面に戻る
          </button>
        </form>
      </div>
    );
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
        <button
          type="button"
          onClick={() => setForgotOpen(true)}
          style={{ height: 28, cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "none" }}
        >
          パスワードをお忘れですか？
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
