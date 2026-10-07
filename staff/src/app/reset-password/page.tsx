"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completePasswordReset } from "@/app/actions";
import { errorMessage } from "@/lib/errors";
import { headingWeight } from "@/lib/style";

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await completePasswordReset(password);
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "設定できませんでした"));
    } finally {
      setSaving(false);
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
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: headingWeight, fontSize: 20 }}>新しいパスワードを設定</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>新しいパスワード（8文字以上）</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="vid-input" style={inputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>確認のため再入力</label>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="vid-input" style={inputStyle} />
        </div>
        {error && <span style={{ fontSize: 12, color: "var(--color-accent-200)" }}>{error}</span>}
        <button
          type="submit"
          disabled={saving}
          style={{ height: 40, marginTop: 4, cursor: saving ? "wait" : "pointer", fontSize: 13.5, color: "var(--color-accent-100)", background: "var(--color-accent-900)", border: "1px solid var(--color-accent)", borderRadius: "var(--radius-md)" }}
        >
          {saving ? "設定中…" : "設定してログイン"}
        </button>
      </form>
    </div>
  );
}
