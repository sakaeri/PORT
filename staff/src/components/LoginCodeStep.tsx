"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, unwrap } from "@/lib/errors";
import { requestLoginLink, verifyLoginCode } from "@/app/actions";
import InfoTooltip from "@/components/InfoTooltip";

// ログイン用メールを送ったあとの画面。メールのリンクを開くか、同じメールに
// 書かれた数字をここに入れるとログインできる（ホーム画面に追加したアプリでは
// リンクが別のブラウザで開いてしまうことがあるため、数字でも入れるようにしている）。
export default function LoginCodeStep({ email, onBack }: { email: string; onBack?: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      unwrap(await verifyLoginCode(email, code));
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "ログインできませんでした"));
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      unwrap(await requestLoginLink(email));
      setResent(true);
    } catch (err) {
      setError(errorMessage(err, "送信できませんでした"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        {email} にログイン用のメールを送りました。メール内のボタンを押すか、確認コードを入力してください。
        <span style={{ marginLeft: 4, display: "inline-flex", verticalAlign: "middle" }}>
          <InfoTooltip text="パスワードは使いません。メールが届かない場合は、登録されていないアドレスか、迷惑メールに振り分けられているかもしれません。ボタンと確認コードは届いてから15分間有効です。" />
        </span>
      </div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="確認コード"
        maxLength={10}
        className="vid-input"
        style={{ width: "100%", height: 44, padding: "6px 12px", fontSize: 18, letterSpacing: "0.2em", textAlign: "center", color: "var(--color-text)", background: "var(--color-bg)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-md)", outline: "none" }}
        autoFocus
      />
      {error && <span style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{error}</span>}
      {resent && !error && <span style={{ fontSize: 12, color: "var(--color-accent-300)" }}>もう一度送りました。</span>}
      <button
        type="submit"
        disabled={busy || !code.trim()}
        style={{ height: 40, cursor: busy ? "wait" : "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)", opacity: busy || !code.trim() ? 0.6 : 1 }}
      >
        {busy ? "確認中…" : "ログイン"}
      </button>
      <div style={{ display: "flex", justifyContent: onBack ? "space-between" : "flex-end", gap: 12 }}>
        {onBack && (
          <button type="button" onClick={onBack} style={linkBtn}>
            アドレスを直す
          </button>
        )}
        <button type="button" onClick={resend} disabled={busy} style={linkBtn}>
          もう一度送る
        </button>
      </div>
    </form>
  );
}

const linkBtn: React.CSSProperties = { padding: 0, cursor: "pointer", fontSize: 12, color: "var(--color-neutral-400)", background: "transparent", border: "none", textDecoration: "underline" };
