"use client";

import { useState } from "react";
import { requestMagicLink } from "@/app/actions";

// 既存アカウントへのログイン導線。今のトークに何かやり取りがある状態でログイン
// しようとした場合だけ、送信前に「引き継がれません」の確認を挟む。
export default function LoginPanel({ hasGuestActivity }: { hasGuestActivity: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setSending(true);
    setError("");
    try {
      await requestMagicLink(email);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信できませんでした");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit() {
    if (!email.trim()) {
      setError("メールアドレスをご入力ください");
      return;
    }
    setError("");
    if (hasGuestActivity) setConfirming(true);
    else send();
  }

  if (sent) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--color-accent-300)", lineHeight: 1.6 }}>
        {email} 宛にログイン用のリンクをお送りしました。メールをご確認ください。
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ alignSelf: "flex-start", padding: 0, cursor: "pointer", fontSize: 11.5, color: "var(--color-neutral-400)", background: "transparent", border: "none", textDecoration: "underline" }}
      >
        以前ご利用いただいたことがある方はログイン
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
      {!confirming ? (
        <>
          <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>登録済みのメールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="vid-input"
            style={{ width: "100%", height: 36, padding: "6px 10px", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
          />
          {error && <span style={{ fontSize: 11, color: "var(--color-accent-200)" }}>{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSubmit} disabled={sending} style={{ flex: 1, height: 34, cursor: "pointer", fontSize: 12.5, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
              ログインリンクを送る
            </button>
            <button onClick={() => setOpen(false)} style={{ flex: "none", height: 34, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
              閉じる
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>ログインすると、今のトークの内容は引き継がれません。よろしいですか？</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={send} disabled={sending} style={{ flex: 1, height: 34, cursor: "pointer", fontSize: 12.5, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
              {sending ? "送信中…" : "ログインする"}
            </button>
            <button onClick={() => setConfirming(false)} style={{ flex: "none", height: 34, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
              やめる
            </button>
          </div>
        </>
      )}
    </div>
  );
}
