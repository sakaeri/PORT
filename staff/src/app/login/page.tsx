"use client";

import { useEffect, useState } from "react";
import { requestLoginLink } from "@/app/actions";
import { errorMessage, unwrap } from "@/lib/errors";
import { headingWeight } from "@/lib/style";
import LoginCodeStep from "@/components/LoginCodeStep";

// ログインはメールで届くリンク（または同じメールの数字）だけ。パスワードは使わない。
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // 期限切れ・使用済みのリンクから戻ってきたとき（auth/confirm が付ける）。
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("linkError")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL (external browser state) after mount
    setError("リンクの有効期限が切れているか、すでに使われています。もう一度お試しください。");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      unwrap(await requestLoginLink(email));
      setSentTo(email.trim());
    } catch (err) {
      setError(errorMessage(err, "送信できませんでした"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", padding: "var(--space-4)" }}>
      <div
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
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>中央秘書事務所 本部</div>
        {sentTo ? (
          <LoginCodeStep email={sentTo} onBack={() => setSentTo("")} />
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>メールアドレス</label>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="vid-input" style={inputStyle} />
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
              {sending ? "送信中…" : "ログイン用のメールを送る"}
            </button>
          </form>
        )}
      </div>
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
