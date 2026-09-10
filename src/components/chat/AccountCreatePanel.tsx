"use client";

import { useState } from "react";
import { setInitialProfile } from "@/app/actions";

// 今の匿名セッション（今のトーク）はそのまま、名前とメールを登録して本アカウント化する。
// ログイン（LoginPanel）とは違い、既存の会話内容は引き継がれる。
// 開閉はマイページのタブ切替側（親）が管理する。
export default function AccountCreatePanel({ onRequestClose }: { onRequestClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim() || !email.trim()) {
      setError("お名前とメールアドレスをご入力ください");
      return;
    }
    setSending(true);
    setError("");
    try {
      await setInitialProfile(name, email, "");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成できませんでした");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--color-accent-300)", lineHeight: 1.6 }}>
        {email} 宛に確認メールをお送りしました。メール内のリンクを開くと登録が完了します。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "var(--radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}>
      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>お名前</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="山田 太郎"
        className="vid-input"
        style={{ width: "100%", height: 36, padding: "6px 10px", fontSize: 13.5, color: "var(--color-text)", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
      />
      <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>メールアドレス</span>
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
        <button onClick={submit} disabled={sending} style={{ flex: 1, height: 34, cursor: "pointer", fontSize: 12.5, color: "var(--color-accent)", background: "transparent", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}>
          {sending ? "作成中…" : "作成する"}
        </button>
        <button onClick={onRequestClose} style={{ flex: "none", height: 34, padding: "0 12px", cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)" }}>
          閉じる
        </button>
      </div>
    </div>
  );
}
